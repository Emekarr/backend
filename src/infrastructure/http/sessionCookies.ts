import type { Request, Response } from 'express'
import { ApplicationError } from '../../entities/errors/applicationError'

export type FrontendSession = 'admin' | 'author' | 'student'
type TokenKind = 'access' | 'refresh' | 'challenge' | 'setup'

const cookieName = (frontend: FrontendSession, kind: TokenKind) => `danvic_${frontend}_${kind}`
const cookieOptions = (maxAgeSeconds: number, httpOnly = true) => ({
  httpOnly,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'none' as const,
  path: '/',
  maxAge: maxAgeSeconds * 1000,
})

const cookies = (request: Request): Record<string, string> =>
  Object.fromEntries(
    (request.headers.cookie ?? '')
      .split(';')
      .map((part) => part.trim().split(/=(.*)/s, 2))
      .filter(([name, value]) => Boolean(name && value))
      .map(([name, value]) => [name!, decodeURIComponent(value!)]),
  )

export const sessionToken = (
  request: Request,
  frontend: FrontendSession,
  kind: TokenKind = 'access',
): string => {
  const [scheme, authorization] = request.headers.authorization?.split(' ') ?? []
  if (scheme?.toLowerCase() === 'bearer' && authorization) return authorization
  const token = cookies(request)[cookieName(frontend, kind)]
  if (!token)
    throw new ApplicationError('Authentication is required', 'AUTHENTICATION_REQUIRED', 401)
  return token
}

export const setSession = (
  response: Response,
  frontend: FrontendSession,
  tokens: { accessToken: string; refreshToken: string },
): void => {
  response.cookie(cookieName(frontend, 'access'), tokens.accessToken, cookieOptions(2 * 60 * 60))
  response.cookie(cookieName(frontend, 'refresh'), tokens.refreshToken, cookieOptions(30 * 24 * 60 * 60))
  response.clearCookie(cookieName(frontend, 'challenge'), cookieOptions(0))
  response.clearCookie(cookieName(frontend, 'setup'), cookieOptions(0))
}

export const setChallenge = (response: Response, frontend: FrontendSession, token: string): void => {
  response.cookie(cookieName(frontend, 'challenge'), token, cookieOptions(5 * 60))
  response.clearCookie(cookieName(frontend, 'access'), cookieOptions(0))
  response.clearCookie(cookieName(frontend, 'refresh'), cookieOptions(0))
}

export const setSetup = (response: Response, frontend: FrontendSession, token: string): void => {
  response.cookie(cookieName(frontend, 'setup'), token, cookieOptions(10 * 60))
  response.clearCookie(cookieName(frontend, 'access'), cookieOptions(0))
  response.clearCookie(cookieName(frontend, 'refresh'), cookieOptions(0))
}

export const clearSession = (response: Response, frontend: FrontendSession): void => {
  for (const kind of ['access', 'refresh', 'challenge', 'setup'] as const)
    response.clearCookie(cookieName(frontend, kind), cookieOptions(0))
}
