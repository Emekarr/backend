import type { Permission } from '../models/Permissions'

export type AuthTokenPurpose = 'access' | 'login-challenge' | 'two-factor-setup'

export interface AuthTokenClaims {
  userId: string
  role: 'admin' | 'author' | 'student'
  email: string
  permissions: Permission[]
  tokenVersion: number
  purpose: AuthTokenPurpose
}

export interface AuthTokenService {
  issue(claims: AuthTokenClaims): string
  verify(token: string, expectedPurpose: AuthTokenPurpose): AuthTokenClaims
}

export interface TwoFactorSetup {
  secret: string
  otpauthUri: string
  qrCodeDataUrl: string
}

export interface TwoFactorVerification {
  valid: boolean
  timeStep?: number
}

export interface TwoFactorAuthenticator {
  createSetup(email: string): Promise<TwoFactorSetup>
  verify(secret: string, code: string, afterTimeStep?: number): Promise<TwoFactorVerification>
}

export interface SecretCipher {
  encrypt(value: string): string
  decrypt(value: string): string
}

export type OneTimeCodePurpose = 'password-reset' | 'two-factor-replay'

export interface OneTimeCodeStore {
  store(
    purpose: OneTimeCodePurpose,
    subject: string,
    valueHash: string,
    ttlSeconds: number,
  ): Promise<void>
  consume(purpose: OneTimeCodePurpose, subject: string, valueHash: string): Promise<boolean>
}

export interface SecureTokenGenerator {
  numericCode(digits: number): string
  token(bytes: number): string
  hash(value: string): string
}

export interface RefreshTokenRecord {
  sessionId: string
  userId: string
  role: 'admin' | 'author' | 'student'
  email: string
  tokenVersion: number
}

export type RefreshTokenRotation =
  | { status: 'rotated'; record: RefreshTokenRecord }
  | { status: 'missing' }
  | { status: 'reused'; record: RefreshTokenRecord }

export interface RefreshTokenStore {
  create(tokenHash: string, record: RefreshTokenRecord, ttlSeconds: number): Promise<void>
  rotate(tokenHash: string, nextTokenHash: string): Promise<RefreshTokenRotation>
  revoke(tokenHash: string): Promise<void>
}

export interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<boolean>
}
