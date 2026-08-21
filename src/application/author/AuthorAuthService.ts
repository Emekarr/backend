import { ApplicationError } from '../../entities/errors/applicationError'
import type { AuthorRepository } from '../../entities/interfaces/authorRepository'
import type {
  AuthTokenClaims,
  AuthTokenService,
  RefreshTokenRecord,
  RefreshTokenStore,
  SecureTokenGenerator,
  SecretCipher,
  TwoFactorAuthenticator,
  TwoFactorSetup,
} from '../../entities/interfaces/auth'
import type { PasswordHasher } from '../../entities/interfaces/services'
import type { Author } from '../../entities/models/Author'

const DUMMY_PASSWORD_HASH =
  'scrypt:00000000000000000000000000000000:373f8e9a7e5369a3f3a924ff35878d76d6b3a7b2b07c08bfa2dfc6668c6509ea582588264f33c6a923cce6a7ff40ceb56e4884712a16c1df06535d301e24b7d1'
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

export type AuthorProfileUpdate = Pick<
  Author,
  'bio' | 'linkedInUrl' | 'xUrl' | 'instagramUrl' | 'facebookUrl' | 'websiteUrl'
>

export class AuthorAuthService {
  constructor(
    private readonly dependencies: {
      authors: AuthorRepository
      passwordHasher: PasswordHasher
      tokens: AuthTokenService
      twoFactor: TwoFactorAuthenticator
      secretCipher: SecretCipher
      refreshTokens: RefreshTokenStore
      secureTokens: SecureTokenGenerator
    },
  ) {}

  async login(
    email: string,
    password: string,
  ): Promise<
    | { status: 'authenticated'; accessToken: string; refreshToken: string }
    | { status: 'two-factor-required'; challengeToken: string }
  > {
    const author = await this.dependencies.authors.findByEmailForAuthentication(
      email.trim().toLowerCase(),
    )
    const valid = await this.dependencies.passwordHasher.verify(
      password,
      author?.password ?? DUMMY_PASSWORD_HASH,
    )
    if (!author || !valid || author.disabledAt)
      throw new ApplicationError('Invalid email or password', 'INVALID_CREDENTIALS', 401)
    return author.twoFactorEnabled
      ? { status: 'two-factor-required', challengeToken: this.issue(author, 'login-challenge') }
      : { status: 'authenticated', ...(await this.issueSession(author)) }
  }

  async beginTwoFactorSetup(accessToken: string): Promise<TwoFactorSetup> {
    const author = await this.authenticate(accessToken)
    if (author.twoFactorEnabled)
      throw new ApplicationError(
        'Two-factor authentication is already enabled',
        'TWO_FACTOR_ENABLED',
        409,
      )
    const setup = await this.dependencies.twoFactor.createSetup(author.email)
    await this.dependencies.authors.updateById(author.id, {
      pendingTwoFactorSecretEncrypted: this.dependencies.secretCipher.encrypt(setup.secret),
    })
    return setup
  }

  async confirmTwoFactorSetup(accessToken: string, code: string): Promise<void> {
    const author = await this.authenticate(accessToken)
    if (!author.pendingTwoFactorSecretEncrypted)
      throw new ApplicationError(
        'Two-factor setup has not been started',
        'TWO_FACTOR_NOT_STARTED',
        409,
      )
    const result = await this.dependencies.twoFactor.verify(
      this.dependencies.secretCipher.decrypt(author.pendingTwoFactorSecretEncrypted),
      code.trim(),
      author.lastTwoFactorTimeStep ?? undefined,
    )
    if (!result.valid || result.timeStep === undefined)
      throw new ApplicationError(
        'Invalid or already-used two-factor code',
        'INVALID_TWO_FACTOR_CODE',
        401,
      )
    const updated = await this.dependencies.authors.consumeTwoFactorTimeStep(
      author.id,
      result.timeStep,
      {
        twoFactorEnabled: true,
        twoFactorSecretEncrypted: author.pendingTwoFactorSecretEncrypted,
        pendingTwoFactorSecretEncrypted: null,
      },
    )
    if (!updated)
      throw new ApplicationError(
        'Two-factor code has already been used',
        'TWO_FACTOR_CODE_REUSED',
        409,
      )
  }

  async verifyTwoFactor(
    challengeToken: string,
    code: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const claims = this.dependencies.tokens.verify(challengeToken, 'login-challenge')
    const author = await this.getTokenAuthor(claims)
    if (!author.twoFactorEnabled || !author.twoFactorSecretEncrypted)
      throw new ApplicationError(
        'Two-factor authentication is not configured',
        'TWO_FACTOR_NOT_CONFIGURED',
        409,
      )
    const result = await this.dependencies.twoFactor.verify(
      this.dependencies.secretCipher.decrypt(author.twoFactorSecretEncrypted),
      code.trim(),
      author.lastTwoFactorTimeStep ?? undefined,
    )
    if (!result.valid || result.timeStep === undefined)
      throw new ApplicationError(
        'Invalid or already-used two-factor code',
        'INVALID_TWO_FACTOR_CODE',
        401,
      )
    const updated = await this.dependencies.authors.consumeTwoFactorTimeStep(
      author.id,
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

  async authenticate(token: string): Promise<Author> {
    return this.getTokenAuthor(this.dependencies.tokens.verify(token, 'access'))
  }

  async renewAccess(refreshToken: string): Promise<string> {
    const record = await this.dependencies.refreshTokens.find(
      this.dependencies.secureTokens.hash(refreshToken),
    )
    if (!record)
      throw new ApplicationError(
        'Refresh token is invalid or expired',
        'INVALID_REFRESH_TOKEN',
        401,
      )
    return this.issue(await this.getRefreshAuthor(record), 'access')
  }

  async updateProfile(authorId: string, input: AuthorProfileUpdate): Promise<Author> {
    const author = await this.dependencies.authors.updateById(authorId, input)
    if (!author) throw new ApplicationError('Author account not found', 'AUTHOR_NOT_FOUND', 404)
    return author
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
    const author = await this.getRefreshAuthor(result.record)
    return { accessToken: this.issue(author, 'access'), refreshToken: nextRefreshToken }
  }

  async logout(refreshToken: string): Promise<void> {
    await this.dependencies.refreshTokens.revoke(this.dependencies.secureTokens.hash(refreshToken))
  }

  private async getTokenAuthor(claims: AuthTokenClaims): Promise<Author> {
    const author = await this.dependencies.authors.findByEmailForAuthentication(claims.email)
    if (
      !author ||
      claims.role !== 'author' ||
      author.id !== claims.userId ||
      author.tokenVersion !== claims.tokenVersion ||
      author.disabledAt
    )
      throw new ApplicationError('Authentication token is no longer valid', 'INVALID_TOKEN', 401)
    return author
  }

  private async getRefreshAuthor(record: RefreshTokenRecord): Promise<Author> {
    const author = await this.dependencies.authors.findByEmailForAuthentication(record.email)
    if (
      !author ||
      record.role !== 'author' ||
      author.id !== record.userId ||
      author.tokenVersion !== record.tokenVersion ||
      author.disabledAt
    )
      throw new ApplicationError('Authentication token is no longer valid', 'INVALID_TOKEN', 401)
    return author
  }

  private async issueSession(
    author: Author,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const refreshToken = this.dependencies.secureTokens.token(32)
    await this.dependencies.refreshTokens.create(
      this.dependencies.secureTokens.hash(refreshToken),
      {
        sessionId: this.dependencies.secureTokens.token(16),
        userId: author.id,
        role: 'author',
        email: author.email,
        tokenVersion: author.tokenVersion,
      },
      REFRESH_TOKEN_TTL_SECONDS,
    )
    return { accessToken: this.issue(author, 'access'), refreshToken }
  }

  private issue(author: Author, purpose: AuthTokenClaims['purpose']): string {
    return this.dependencies.tokens.issue({
      userId: author.id,
      role: 'author',
      email: author.email,
      permissions: [],
      tokenVersion: author.tokenVersion,
      purpose,
    })
  }
}
