import type { AdminRepository } from '../../entities/interfaces/adminRepository'
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
import { ApplicationError } from '../../entities/errors/applicationError'
import type { Admin } from '../../entities/models/Admin'

const DUMMY_PASSWORD_HASH =
  'scrypt:00000000000000000000000000000000:373f8e9a7e5369a3f3a924ff35878d76d6b3a7b2b07c08bfa2dfc6668c6509ea582588264f33c6a923cce6a7ff40ceb56e4884712a16c1df06535d301e24b7d1'
const PASSWORD_RESET_TTL_SECONDS = 10 * 60
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

export type LoginResult =
  | ({ status: 'authenticated' } & SessionTokens)
  | { status: 'two-factor-required'; challengeToken: string }
  | { status: 'two-factor-setup-required'; setupToken: string }

export interface AdminAuthDependencies {
  admins: AdminRepository
  passwordHasher: PasswordHasher
  tokens: AuthTokenService
  twoFactor: TwoFactorAuthenticator
  secretCipher: SecretCipher
  oneTimeCodes: OneTimeCodeStore
  secureTokens: SecureTokenGenerator
  emailJobs: EmailJobQueue
  logger: Logger
  refreshTokens: RefreshTokenStore
}

export interface SessionTokens {
  accessToken: string
  refreshToken: string
}

export class AdminAuthService {
  constructor(private readonly dependencies: AdminAuthDependencies) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase()
    const admin = await this.dependencies.admins.findByEmailForAuthentication(normalizedEmail)
    const passwordMatches = await this.dependencies.passwordHasher.verify(
      password,
      admin?.password ?? DUMMY_PASSWORD_HASH,
    )

    if (!admin || !passwordMatches || admin.disabledAt) {
      throw new ApplicationError('Invalid email or password', 'INVALID_CREDENTIALS', 401)
    }

    if (admin.isSuperAdmin && !admin.twoFactorEnabled) {
      return {
        status: 'two-factor-setup-required',
        setupToken: this.issueToken(admin, 'two-factor-setup'),
      }
    }

    if (admin.twoFactorEnabled) {
      return {
        status: 'two-factor-required',
        challengeToken: this.issueToken(admin, 'login-challenge'),
      }
    }

    return { status: 'authenticated', ...(await this.issueSession(admin)) }
  }

  async beginTwoFactorSetup(setupToken: string): Promise<TwoFactorSetup> {
    const claims = this.dependencies.tokens.verify(setupToken, 'two-factor-setup')
    const admin = await this.getTokenAdmin(claims)

    if (admin.twoFactorEnabled) {
      throw new ApplicationError(
        'Two-factor authentication is already enabled',
        'TWO_FACTOR_ENABLED',
        409,
      )
    }

    const setup = await this.dependencies.twoFactor.createSetup(admin.email)
    await this.dependencies.admins.updateById(admin.id, {
      pendingTwoFactorSecretEncrypted: this.dependencies.secretCipher.encrypt(setup.secret),
    })

    return setup
  }

  async confirmTwoFactorSetup(setupToken: string, code: string): Promise<SessionTokens> {
    const claims = this.dependencies.tokens.verify(setupToken, 'two-factor-setup')
    const admin = await this.getTokenAdmin(claims)
    const encryptedSecret = admin.pendingTwoFactorSecretEncrypted

    if (!encryptedSecret) {
      throw new ApplicationError(
        'Two-factor setup has not been started',
        'TWO_FACTOR_NOT_STARTED',
        409,
      )
    }

    const secret = this.dependencies.secretCipher.decrypt(encryptedSecret)
    const result = await this.dependencies.twoFactor.verify(
      secret,
      code.trim(),
      admin.lastTwoFactorTimeStep ?? undefined,
    )

    if (!result.valid || result.timeStep === undefined) {
      throw new ApplicationError(
        'Invalid or already-used two-factor code',
        'INVALID_TWO_FACTOR_CODE',
        401,
      )
    }

    const updated = await this.dependencies.admins.consumeTwoFactorTimeStep(
      admin.id,
      result.timeStep,
      {
        twoFactorEnabled: true,
        twoFactorSecretEncrypted: encryptedSecret,
        pendingTwoFactorSecretEncrypted: null,
      },
    )

    if (!updated) {
      throw new ApplicationError(
        'Two-factor code has already been used',
        'TWO_FACTOR_CODE_REUSED',
        409,
      )
    }

    return this.issueSession(updated)
  }

  async verifyTwoFactor(challengeToken: string, code: string): Promise<SessionTokens> {
    const claims = this.dependencies.tokens.verify(challengeToken, 'login-challenge')
    const admin = await this.getTokenAdmin(claims)

    if (!admin.twoFactorEnabled || !admin.twoFactorSecretEncrypted) {
      throw new ApplicationError(
        'Two-factor authentication is not configured',
        'TWO_FACTOR_NOT_CONFIGURED',
        409,
      )
    }

    const result = await this.dependencies.twoFactor.verify(
      this.dependencies.secretCipher.decrypt(admin.twoFactorSecretEncrypted),
      code.trim(),
      admin.lastTwoFactorTimeStep ?? undefined,
    )

    if (!result.valid || result.timeStep === undefined) {
      throw new ApplicationError(
        'Invalid or already-used two-factor code',
        'INVALID_TWO_FACTOR_CODE',
        401,
      )
    }

    const updated = await this.dependencies.admins.consumeTwoFactorTimeStep(
      admin.id,
      result.timeStep,
    )

    if (!updated) {
      throw new ApplicationError(
        'Two-factor code has already been used',
        'TWO_FACTOR_CODE_REUSED',
        409,
      )
    }

    return this.issueSession(updated)
  }

  async requestPasswordReset(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase()
    const admin = await this.dependencies.admins.findByEmailForAuthentication(normalizedEmail)

    if (!admin || admin.disabledAt) {
      this.dependencies.logger.info('Password reset requested for an unknown or disabled account')
      return
    }

    const code = this.dependencies.secureTokens.numericCode(6)
    await this.dependencies.oneTimeCodes.store(
      'password-reset',
      admin.id,
      this.dependencies.secureTokens.hash(code),
      PASSWORD_RESET_TTL_SECONDS,
    )
    await this.dependencies.emailJobs.enqueue({
      type: 'password-reset',
      email: admin.email,
      code,
    })
  }

  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    this.assertPassword(newPassword)
    const admin = await this.dependencies.admins.findByEmailForAuthentication(
      email.trim().toLowerCase(),
    )

    if (!admin || admin.disabledAt) {
      throw new ApplicationError('Invalid or expired reset code', 'INVALID_RESET_CODE', 400)
    }

    const consumed = await this.dependencies.oneTimeCodes.consume(
      'password-reset',
      admin.id,
      this.dependencies.secureTokens.hash(code),
    )

    if (!consumed) {
      throw new ApplicationError('Invalid or expired reset code', 'INVALID_RESET_CODE', 400)
    }

    await this.dependencies.admins.updateById(admin.id, {
      password: await this.dependencies.passwordHasher.hash(newPassword),
      passwordChangedAt: new Date(),
      tokenVersion: admin.tokenVersion + 1,
    })
  }

  async updatePassword(
    adminId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    this.assertPassword(newPassword)
    const admin = await this.dependencies.admins.findById(adminId)

    if (!admin) {
      throw new ApplicationError('Admin account not found', 'ADMIN_NOT_FOUND', 404)
    }

    const authenticatedAdmin = await this.dependencies.admins.findByEmailForAuthentication(
      admin.email,
    )
    const matches =
      authenticatedAdmin &&
      (await this.dependencies.passwordHasher.verify(currentPassword, authenticatedAdmin.password))

    if (!matches) {
      throw new ApplicationError('Current password is incorrect', 'INVALID_CURRENT_PASSWORD', 401)
    }

    await this.dependencies.admins.updateById(admin.id, {
      password: await this.dependencies.passwordHasher.hash(newPassword),
      passwordChangedAt: new Date(),
      tokenVersion: admin.tokenVersion + 1,
    })
  }

  async authenticate(accessToken: string): Promise<Admin> {
    const claims = this.dependencies.tokens.verify(accessToken, 'access')
    const admin = await this.getTokenAdmin(claims)

    if (admin.isSuperAdmin && !admin.twoFactorEnabled) {
      throw new ApplicationError('Two-factor setup is required', 'TWO_FACTOR_SETUP_REQUIRED', 403)
    }

    return admin
  }

  async refresh(refreshToken: string): Promise<SessionTokens> {
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

    const admin = await this.getRefreshAdmin(result.record)
    return { accessToken: this.issueToken(admin, 'access'), refreshToken: nextRefreshToken }
  }

  async logout(refreshToken: string): Promise<void> {
    await this.dependencies.refreshTokens.revoke(this.dependencies.secureTokens.hash(refreshToken))
  }

  private async getTokenAdmin(claims: AuthTokenClaims): Promise<Admin> {
    const admin = await this.dependencies.admins.findByEmailForAuthentication(claims.email)

    if (
      !admin ||
      claims.role !== 'admin' ||
      admin.id !== claims.userId ||
      admin.tokenVersion !== claims.tokenVersion ||
      admin.disabledAt
    ) {
      throw new ApplicationError('Authentication token is no longer valid', 'INVALID_TOKEN', 401)
    }

    return admin
  }

  private async getRefreshAdmin(record: RefreshTokenRecord): Promise<Admin> {
    const admin = await this.dependencies.admins.findByEmailForAuthentication(record.email)
    if (
      !admin ||
      record.role !== 'admin' ||
      admin.id !== record.userId ||
      admin.tokenVersion !== record.tokenVersion ||
      admin.disabledAt
    ) {
      throw new ApplicationError('Authentication token is no longer valid', 'INVALID_TOKEN', 401)
    }
    return admin
  }

  private async issueSession(admin: Admin): Promise<SessionTokens> {
    const refreshToken = this.dependencies.secureTokens.token(32)
    await this.dependencies.refreshTokens.create(
      this.dependencies.secureTokens.hash(refreshToken),
      {
        sessionId: this.dependencies.secureTokens.token(16),
        userId: admin.id,
        role: 'admin',
        email: admin.email,
        tokenVersion: admin.tokenVersion,
      },
      REFRESH_TOKEN_TTL_SECONDS,
    )
    return { accessToken: this.issueToken(admin, 'access'), refreshToken }
  }

  private issueToken(admin: Admin, purpose: AuthTokenClaims['purpose']): string {
    return this.dependencies.tokens.issue({
      userId: admin.id,
      role: 'admin',
      email: admin.email,
      permissions: admin.permissions,
      tokenVersion: admin.tokenVersion,
      purpose,
    })
  }

  private assertPassword(password: string): void {
    if (password.length < 12 || password.length > 128) {
      throw new ApplicationError(
        'Password must be between 12 and 128 characters',
        'WEAK_PASSWORD',
        400,
      )
    }
  }
}
