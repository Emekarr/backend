import jwt, { type JwtPayload } from 'jsonwebtoken'
import type {
  AuthTokenClaims,
  AuthTokenPurpose,
  AuthTokenService,
} from '../../entities/interfaces/auth'
import { ApplicationError } from '../../entities/errors/applicationError'
import { PERMISSIONS, type Permission } from '../../entities/models/Permissions'
import type { EnvironmentConfig } from '../config/environment'

const TOKEN_TTL_SECONDS: Record<AuthTokenPurpose, number> = {
  // Browser sessions use a short-lived access token plus a rotating refresh token.
  // Keep this aligned with the httpOnly cookie lifetime in each Next.js application.
  access: 2 * 60 * 60,
  'login-challenge': 5 * 60,
  'two-factor-setup': 10 * 60,
}

export class JwtAuthTokenService implements AuthTokenService {
  constructor(private readonly config: EnvironmentConfig) {}

  issue(claims: AuthTokenClaims): string {
    return jwt.sign(
      {
        email: claims.email,
        permissions: claims.permissions,
        tokenVersion: claims.tokenVersion,
        purpose: claims.purpose,
        role: claims.role,
      },
      this.config.JWT_SECRET,
      {
        algorithm: 'HS256',
        subject: claims.userId,
        issuer: this.config.SERVICE_NAME,
        audience: `${this.config.SERVICE_NAME}:users`,
        expiresIn: TOKEN_TTL_SECONDS[claims.purpose],
      },
    )
  }

  verify(token: string, expectedPurpose: AuthTokenPurpose): AuthTokenClaims {
    try {
      const payload = jwt.verify(token, this.config.JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: this.config.SERVICE_NAME,
        audience: `${this.config.SERVICE_NAME}:users`,
      })

      if (typeof payload === 'string' || !this.isValidPayload(payload, expectedPurpose)) {
        throw new Error('Invalid authentication claims')
      }

      return {
        userId: payload.sub as string,
        role: payload.role,
        email: payload.email,
        permissions: payload.permissions,
        tokenVersion: payload.tokenVersion,
        purpose: payload.purpose,
      }
    } catch {
      throw new ApplicationError('Invalid or expired authentication token', 'INVALID_TOKEN', 401)
    }
  }

  private isValidPayload(
    payload: JwtPayload,
    expectedPurpose: AuthTokenPurpose,
  ): payload is JwtPayload & Omit<AuthTokenClaims, 'userId'> & { sub: string } {
    return (
      typeof payload.sub === 'string' &&
      typeof payload.email === 'string' &&
      typeof payload.tokenVersion === 'number' &&
      (payload.role === 'admin' || payload.role === 'author' || payload.role === 'student') &&
      payload.purpose === expectedPurpose &&
      Array.isArray(payload.permissions) &&
      payload.permissions.every((permission): permission is Permission =>
        PERMISSIONS.includes(permission as Permission),
      )
    )
  }
}
