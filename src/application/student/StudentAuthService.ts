import { ApplicationError } from '../../entities/errors/applicationError'
import type {
  AuthTokenClaims,
  AuthTokenService,
  OneTimeCodeStore,
  RefreshTokenRecord,
  RefreshTokenStore,
  SecretCipher,
  SecureTokenGenerator,
  TwoFactorAuthenticator,
  TwoFactorSetup,
} from '../../entities/interfaces/auth'
import type { Logger } from '../../entities/interfaces/logger'
import type { EmailJobQueue, PasswordHasher } from '../../entities/interfaces/services'
import type { StudentRepository } from '../../entities/interfaces/studentRepository'
import type { Student } from '../../entities/models/Student'

const DUMMY_PASSWORD_HASH =
  'scrypt:00000000000000000000000000000000:373f8e9a7e5369a3f3a924ff35878d76d6b3a7b2b07c08bfa2dfc6668c6509ea582588264f33c6a923cce6a7ff40ceb56e4884712a16c1df06535d301e24b7d1'
const PASSWORD_RESET_TTL_SECONDS = 10 * 60
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

export type StudentLoginResult =
  | { status: 'two-factor-required'; challengeToken: string }
  | { status: 'two-factor-setup-required'; setupToken: string }

export type StudentProfileUpdate = Pick<
  Student,
  'bio' | 'linkedInUrl' | 'xUrl' | 'facebookUrl' | 'instagramUrl' | 'youtubeUrl' | 'websiteUrl'
>

export class StudentAuthService {
  constructor(
    private readonly dependencies: {
      students: StudentRepository
      passwordHasher: PasswordHasher
      tokens: AuthTokenService
      twoFactor: TwoFactorAuthenticator
      secretCipher: SecretCipher
      oneTimeCodes: OneTimeCodeStore
      refreshTokens: RefreshTokenStore
      secureTokens: SecureTokenGenerator
      emailJobs: EmailJobQueue
      logger: Logger
    },
  ) {}

  async login(email: string, password: string): Promise<StudentLoginResult> {
    const student = await this.dependencies.students.findByEmailForAuthentication(
      email.trim().toLowerCase(),
    )
    const valid = await this.dependencies.passwordHasher.verify(
      password,
      student?.password ?? DUMMY_PASSWORD_HASH,
    )
    if (!student || !valid || student.disabledAt)
      throw new ApplicationError('Invalid email or password', 'INVALID_CREDENTIALS', 401)
    return student.twoFactorEnabled
      ? { status: 'two-factor-required', challengeToken: this.issue(student, 'login-challenge') }
      : { status: 'two-factor-setup-required', setupToken: this.issue(student, 'two-factor-setup') }
  }

  async beginTwoFactorSetup(setupToken: string): Promise<TwoFactorSetup> {
    const student = await this.getTokenStudent(
      this.dependencies.tokens.verify(setupToken, 'two-factor-setup'),
    )
    if (student.twoFactorEnabled)
      throw new ApplicationError(
        'Two-factor authentication is already enabled',
        'TWO_FACTOR_ENABLED',
        409,
      )
    const setup = await this.dependencies.twoFactor.createSetup(student.email)
    await this.dependencies.students.updateById(student.id, {
      pendingTwoFactorSecretEncrypted: this.dependencies.secretCipher.encrypt(setup.secret),
    })
    return setup
  }

  async confirmTwoFactorSetup(
    setupToken: string,
    code: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const student = await this.getTokenStudent(
      this.dependencies.tokens.verify(setupToken, 'two-factor-setup'),
    )
    const encryptedSecret = student.pendingTwoFactorSecretEncrypted
    if (!encryptedSecret)
      throw new ApplicationError(
        'Two-factor setup has not been started',
        'TWO_FACTOR_NOT_STARTED',
        409,
      )
    const result = await this.dependencies.twoFactor.verify(
      this.dependencies.secretCipher.decrypt(encryptedSecret),
      code.trim(),
      student.lastTwoFactorTimeStep ?? undefined,
    )
    if (!result.valid || result.timeStep === undefined)
      throw new ApplicationError(
        'Invalid or already-used two-factor code',
        'INVALID_TWO_FACTOR_CODE',
        401,
      )
    const updated = await this.dependencies.students.consumeTwoFactorTimeStep(
      student.id,
      result.timeStep,
      {
        twoFactorEnabled: true,
        twoFactorSecretEncrypted: encryptedSecret,
        pendingTwoFactorSecretEncrypted: null,
      },
    )
    if (!updated)
      throw new ApplicationError(
        'Two-factor code has already been used',
        'TWO_FACTOR_CODE_REUSED',
        409,
      )
    return this.issueSession(updated)
  }

  async verifyTwoFactor(
    challengeToken: string,
    code: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const student = await this.getTokenStudent(
      this.dependencies.tokens.verify(challengeToken, 'login-challenge'),
    )
    if (!student.twoFactorEnabled || !student.twoFactorSecretEncrypted)
      throw new ApplicationError(
        'Two-factor authentication is not configured',
        'TWO_FACTOR_NOT_CONFIGURED',
        409,
      )
    const result = await this.dependencies.twoFactor.verify(
      this.dependencies.secretCipher.decrypt(student.twoFactorSecretEncrypted),
      code.trim(),
      student.lastTwoFactorTimeStep ?? undefined,
    )
    if (!result.valid || result.timeStep === undefined)
      throw new ApplicationError(
        'Invalid or already-used two-factor code',
        'INVALID_TWO_FACTOR_CODE',
        401,
      )
    const updated = await this.dependencies.students.consumeTwoFactorTimeStep(
      student.id,
      result.timeStep,
    )
    if (!updated)
      throw new ApplicationError(
        'Two-factor code has already been used',
        'TWO_FACTOR_CODE_REUSED',
        409,
      )
    return this.issueSession(updated)
  }

  async requestPasswordReset(email: string): Promise<void> {
    const student = await this.dependencies.students.findByEmailForAuthentication(
      email.trim().toLowerCase(),
    )
    if (!student || student.disabledAt) {
      this.dependencies.logger.info('Student password reset requested for an unknown account')
      return
    }
    const code = this.dependencies.secureTokens.numericCode(6)
    await this.dependencies.oneTimeCodes.store(
      'password-reset',
      `student:${student.id}`,
      this.dependencies.secureTokens.hash(code),
      PASSWORD_RESET_TTL_SECONDS,
    )
    await this.dependencies.emailJobs.enqueue({
      type: 'password-reset',
      email: student.email,
      code,
    })
  }

  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    this.assertPassword(newPassword)
    const student = await this.dependencies.students.findByEmailForAuthentication(
      email.trim().toLowerCase(),
    )
    if (!student || student.disabledAt)
      throw new ApplicationError('Invalid or expired reset code', 'INVALID_RESET_CODE', 400)
    const consumed = await this.dependencies.oneTimeCodes.consume(
      'password-reset',
      `student:${student.id}`,
      this.dependencies.secureTokens.hash(code),
    )
    if (!consumed)
      throw new ApplicationError('Invalid or expired reset code', 'INVALID_RESET_CODE', 400)
    await this.dependencies.students.updateById(student.id, {
      password: await this.dependencies.passwordHasher.hash(newPassword),
      passwordChangedAt: new Date(),
      tokenVersion: student.tokenVersion + 1,
    })
  }

  async updatePassword(
    studentId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    this.assertPassword(newPassword)
    const found = await this.dependencies.students.findById(studentId)
    if (!found) throw new ApplicationError('Student account not found', 'STUDENT_NOT_FOUND', 404)
    const student = await this.dependencies.students.findByEmailForAuthentication(found.email)
    if (
      !student ||
      !(await this.dependencies.passwordHasher.verify(currentPassword, student.password))
    )
      throw new ApplicationError('Current password is incorrect', 'INVALID_CURRENT_PASSWORD', 401)
    await this.dependencies.students.updateById(student.id, {
      password: await this.dependencies.passwordHasher.hash(newPassword),
      passwordChangedAt: new Date(),
      tokenVersion: student.tokenVersion + 1,
    })
  }

  async updateProfile(studentId: string, input: StudentProfileUpdate): Promise<Student> {
    const student = await this.dependencies.students.updateById(studentId, input)
    if (!student) throw new ApplicationError('Student account not found', 'STUDENT_NOT_FOUND', 404)
    return student
  }

  async authenticate(accessToken: string): Promise<Student> {
    const student = await this.getTokenStudent(
      this.dependencies.tokens.verify(accessToken, 'access'),
    )
    if (!student.twoFactorEnabled)
      throw new ApplicationError('Two-factor setup is required', 'TWO_FACTOR_SETUP_REQUIRED', 403)
    return student
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const nextRefreshToken = this.dependencies.secureTokens.token(32)
    const result = await this.dependencies.refreshTokens.rotate(
      this.dependencies.secureTokens.hash(refreshToken),
      this.dependencies.secureTokens.hash(nextRefreshToken),
    )
    if (result.status === 'missing')
      throw new ApplicationError(
        'Refresh token is invalid or expired',
        'INVALID_REFRESH_TOKEN',
        401,
      )
    if (result.status === 'reused')
      throw new ApplicationError('Refresh token reuse detected', 'REFRESH_TOKEN_REUSED', 401)
    const student = await this.getRefreshStudent(result.record)
    if (!student.twoFactorEnabled)
      throw new ApplicationError('Two-factor setup is required', 'TWO_FACTOR_SETUP_REQUIRED', 403)
    return { accessToken: this.issue(student, 'access'), refreshToken: nextRefreshToken }
  }

  async logout(refreshToken: string): Promise<void> {
    await this.dependencies.refreshTokens.revoke(this.dependencies.secureTokens.hash(refreshToken))
  }

  private async getTokenStudent(claims: AuthTokenClaims): Promise<Student> {
    const student = await this.dependencies.students.findByEmailForAuthentication(claims.email)
    if (
      !student ||
      claims.role !== 'student' ||
      student.id !== claims.userId ||
      student.tokenVersion !== claims.tokenVersion ||
      student.disabledAt
    )
      throw new ApplicationError('Authentication token is no longer valid', 'INVALID_TOKEN', 401)
    return student
  }

  private async getRefreshStudent(record: RefreshTokenRecord): Promise<Student> {
    const student = await this.dependencies.students.findByEmailForAuthentication(record.email)
    if (
      !student ||
      record.role !== 'student' ||
      student.id !== record.userId ||
      student.tokenVersion !== record.tokenVersion ||
      student.disabledAt
    )
      throw new ApplicationError('Authentication token is no longer valid', 'INVALID_TOKEN', 401)
    return student
  }

  private async issueSession(
    student: Student,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const refreshToken = this.dependencies.secureTokens.token(32)
    await this.dependencies.refreshTokens.create(
      this.dependencies.secureTokens.hash(refreshToken),
      {
        sessionId: this.dependencies.secureTokens.token(16),
        userId: student.id,
        role: 'student',
        email: student.email,
        tokenVersion: student.tokenVersion,
      },
      REFRESH_TOKEN_TTL_SECONDS,
    )
    return { accessToken: this.issue(student, 'access'), refreshToken }
  }

  private issue(student: Student, purpose: AuthTokenClaims['purpose']): string {
    return this.dependencies.tokens.issue({
      userId: student.id,
      role: 'student',
      email: student.email,
      permissions: [],
      tokenVersion: student.tokenVersion,
      purpose,
    })
  }

  private assertPassword(password: string): void {
    if (password.length < 12 || password.length > 128)
      throw new ApplicationError(
        'Password must be between 12 and 128 characters',
        'WEAK_PASSWORD',
        400,
      )
  }
}
