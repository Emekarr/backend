import { Router, type NextFunction, type Request, type Response } from 'express'
import type { AdminAuthService } from '../../../application/auth/AdminAuthService'
import type {
  AuthorAuthService,
  AuthorProfileUpdate,
} from '../../../application/author/AuthorAuthService'
import type { AuthorInvitationService } from '../../../application/author/AuthorInvitationService'
import { ApplicationError } from '../../../entities/errors/applicationError'
import type { RateLimiter } from '../../../entities/interfaces/auth'
import type { Admin } from '../../../entities/models/Admin'
import type { Author } from '../../../entities/models/Author'
import { setActivity } from '../activityAudit'
import {
  authenticateSession,
  clearSession,
  sessionToken,
  setChallenge,
  setSession,
} from '../sessionCookies'
import { schemas, validateBody, validateQuery } from '../../validation/joi'

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>
type AuthenticatedAdmin = Request & { admin: Admin }
type AuthenticatedAuthor = Request & { author: Author }

export const createAuthorRouter = (dependencies: {
  adminAuth: AdminAuthService
  authorAuth: AuthorAuthService
  invitations: AuthorInvitationService
  rateLimiter: RateLimiter
}): Router => {
  const router = Router()

  router.post(
    '/author/auth/login',
    validateQuery(),
    validateBody(schemas.login),
    limit(dependencies.rateLimiter, 'author-login', 10, 60),
    asyncRoute(async (request, response) => {
      const body = request.body as { email: string; password: string }
      setActivity(request, { action: 'author.login', actorEmail: body.email })
      const result = await dependencies.authorAuth.login(body.email, body.password)
      if (result.status === 'authenticated') setSession(response, 'author', result, request)
      else setChallenge(response, 'author', result.challengeToken, request)
      const next = result.status === 'authenticated' ? '/dashboard' : '/two-factor'
      response.status(result.status === 'authenticated' ? 200 : 202).json({ ...result, next })
    }),
  )

  router.post(
    '/author/auth/refresh',
    validateQuery(),
    validateBody(schemas.empty),
    limit(dependencies.rateLimiter, 'author-refresh', 30, 60),
    asyncRoute(async (request, response) => {
      const tokens = await dependencies.authorAuth.refresh(bearer(request, 'refresh'))
      setSession(response, 'author', tokens, request)
      response.status(200).json(tokens)
    }),
  )

  router.post(
    '/author/auth/logout',
    validateQuery(),
    validateBody(schemas.empty),
    asyncRoute(async (request, response) => {
      await dependencies.authorAuth.logout(bearer(request, 'refresh'))
      clearSession(response, 'author', request)
      response.status(200).json(null)
    }),
  )

  router.post(
    '/author/auth/2fa/setup',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateBody(schemas.empty),
    asyncRoute(async (request, response) => {
      setActivity(request, { action: 'author.two-factor.setup' })
      response.json(await dependencies.authorAuth.beginTwoFactorSetup(bearer(request)))
    }),
  )

  router.post(
    '/author/auth/2fa/confirm',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateBody(schemas.twoFactorCode),
    asyncRoute(async (request, response) => {
      setActivity(request, { action: 'author.two-factor.confirm' })
      await dependencies.authorAuth.confirmTwoFactorSetup(
        bearer(request, 'challenge'),
        (request.body as { code: string }).code,
      )
      response.status(200).json(null)
    }),
  )

  router.post(
    '/author/auth/2fa/verify',
    validateQuery(),
    validateBody(schemas.twoFactorCode),
    limit(dependencies.rateLimiter, 'author-2fa', 10, 300),
    asyncRoute(async (request, response) => {
      const tokens = await dependencies.authorAuth.verifyTwoFactor(
        bearer(request),
        (request.body as { code: string }).code,
      )
      setSession(response, 'author', tokens, request)
      response.json({ ...tokens, next: '/dashboard' })
    }),
  )

  router.get(
    '/author/auth/me',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    asyncRoute(async (request, response) => {
      const author = (request as AuthenticatedAuthor).author
      response.json({
        author: {
          id: author.id,
          firstName: author.firstName,
          lastName: author.lastName,
          email: author.email,
          bio: author.bio,
          linkedInUrl: author.linkedInUrl,
          xUrl: author.xUrl,
          instagramUrl: author.instagramUrl,
          facebookUrl: author.facebookUrl,
          websiteUrl: author.websiteUrl,
          twoFactorEnabled: author.twoFactorEnabled,
          disabledAt: author.disabledAt,
          createdAt: author.createdAt,
          updatedAt: author.updatedAt,
        },
      })
    }),
  )

  router.put(
    '/author/profile',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateBody(schemas.authorProfile),
    asyncRoute(async (request, response) => {
      const author = (request as AuthenticatedAuthor).author
      const updated = await dependencies.authorAuth.updateProfile(
        author.id,
        request.body as AuthorProfileUpdate,
      )
      setActivity(request, { action: 'author.profile.update' })
      response.status(200).json({
        author: {
          id: updated.id,
          firstName: updated.firstName,
          lastName: updated.lastName,
          email: updated.email,
          bio: updated.bio,
          linkedInUrl: updated.linkedInUrl,
          xUrl: updated.xUrl,
          instagramUrl: updated.instagramUrl,
          facebookUrl: updated.facebookUrl,
          websiteUrl: updated.websiteUrl,
          twoFactorEnabled: updated.twoFactorEnabled,
          disabledAt: updated.disabledAt,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        },
      })
    }),
  )

  router.post(
    '/admin/author-invitations',
    authenticateAdmin(dependencies.adminAuth),
    requireInviteAuthor,
    validateQuery(),
    validateBody(schemas.invitationList),
    asyncRoute(async (request, response) => {
      const emails = (request.body as { emails: string[] }).emails
      setActivity(request, {
        action: 'author.invitations.create',
        metadata: { count: emails.length },
      })
      response.status(202).json({
        invitations: await dependencies.invitations.invite(
          (request as AuthenticatedAdmin).admin,
          emails,
        ),
      })
    }),
  )

  router.get(
    '/admin/author-invitations',
    authenticateAdmin(dependencies.adminAuth),
    requireInviteAuthor,
    validateQuery(),
    asyncRoute(async (request, response) => {
      const invitations = await dependencies.invitations.list((request as AuthenticatedAdmin).admin)
      response.json({ invitations: invitations.map(({ tokenHash: _tokenHash, ...item }) => item) })
    }),
  )

  router.post(
    '/author/invitations/accept',
    validateQuery(),
    validateBody(schemas.acceptInvitation),
    asyncRoute(async (request, response) => {
      const body = request.body as {
        token: string
        firstName: string
        lastName: string
        password: string
      }
      setActivity(request, { action: 'author.invitation.accept' })
      await dependencies.invitations.accept(body.token, body)
      response.status(201).json({ message: 'Author account created' })
    }),
  )
  return router
}

export const authenticateAuthor = (auth: AuthorAuthService) =>
  asyncRoute(async (request, response, next) => {
    const author = await authenticateSession(request, response, 'author', auth)
    Object.assign(request, { author })
    setActivity(request, { actorType: 'author', actorId: author.id, actorEmail: author.email })
    next()
  })

const authenticateAdmin = (auth: AdminAuthService) =>
  asyncRoute(async (request, response, next) => {
    const admin = await authenticateSession(request, response, 'admin', auth)
    Object.assign(request, { admin })
    setActivity(request, { actorType: 'admin', actorId: admin.id, actorEmail: admin.email })
    next()
  })

const requireInviteAuthor = (request: Request, _response: Response, next: NextFunction): void => {
  const admin = (request as AuthenticatedAdmin).admin
  if (!admin.isSuperAdmin && !admin.permissions.includes('invite_author'))
    return next(new ApplicationError('You do not have the required permission', 'FORBIDDEN', 403))
  next()
}

const limit = (limiter: RateLimiter, scope: string, maximum: number, seconds: number) =>
  asyncRoute(async (request, _response, next) => {
    if (!(await limiter.consume(`${scope}:${request.ip}`, maximum, seconds)))
      throw new ApplicationError('Too many requests; try again later', 'RATE_LIMITED', 429)
    next()
  })

const bearer = (request: Request, kind: 'access' | 'refresh' | 'challenge' | 'setup' = 'access') =>
  sessionToken(request, 'author', kind)

const asyncRoute =
  (handler: AsyncHandler) =>
  (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next)
  }

export const authenticatedAuthor = (request: Request): Author =>
  (request as AuthenticatedAuthor).author
