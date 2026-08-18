import { Router, type NextFunction, type Request, type Response } from 'express'
import type { AdminInvitationService } from '../../../application/admin/AdminInvitationService'
import type { AdminDirectoryService } from '../../../application/admin/AdminDirectoryService'
import type { AdminNotificationService } from '../../../application/admin/AdminNotificationService'
import type { AdminAuthService } from '../../../application/auth/AdminAuthService'
import { ApplicationError } from '../../../entities/errors/applicationError'
import type { RateLimiter } from '../../../entities/interfaces/auth'
import type { Admin } from '../../../entities/models/Admin'
import type { Permission } from '../../../entities/models/Permissions'
import { setActivity } from '../activityAudit'
import { clearSession, sessionToken, setChallenge, setSession, setSetup } from '../sessionCookies'
import { schemas, validateBody, validateParams, validateQuery } from '../../validation/joi'

export interface AdminRouteDependencies {
  auth: AdminAuthService
  invitations: AdminInvitationService
  directory: AdminDirectoryService
  notifications: AdminNotificationService
  rateLimiter: RateLimiter
}

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>
type AuthenticatedRequest = Request & { admin: Admin }

export const createAdminRouter = (dependencies: AdminRouteDependencies): Router => {
  const router = Router()

  router.post(
    '/admin/auth/login',
    validateQuery(),
    validateBody(schemas.login),
    rateLimit(dependencies.rateLimiter, 'admin-login', 10, 60),
    asyncRoute(async (request, response) => {
      const body = request.body as { email: string; password: string }
      setActivity(request, { action: 'admin.login', actorEmail: body.email })
      const result = await dependencies.auth.login(body.email, body.password)
      if (result.status === 'authenticated') setSession(response, 'admin', result)
      else if (result.status === 'two-factor-required')
        setChallenge(response, 'admin', result.challengeToken)
      else setSetup(response, 'admin', result.setupToken)
      response.status(result.status === 'authenticated' ? 200 : 202).json(result)
    }),
  )

  router.post(
    '/admin/auth/refresh',
    validateQuery(),
    validateBody(schemas.empty),
    rateLimit(dependencies.rateLimiter, 'admin-refresh', 30, 60),
    asyncRoute(async (request, response) => {
      const tokens = await dependencies.auth.refresh(bearerToken(request, 'refresh'))
      setSession(response, 'admin', tokens)
      response.status(200).json(tokens)
    }),
  )

  router.post(
    '/admin/auth/logout',
    validateQuery(),
    validateBody(schemas.empty),
    asyncRoute(async (request, response) => {
      await dependencies.auth.logout(bearerToken(request, 'refresh'))
      clearSession(response, 'admin')
      response.status(200).json(null)
    }),
  )

  router.post(
    '/admin/auth/forgot-password',
    validateQuery(),
    validateBody(schemas.email),
    rateLimit(dependencies.rateLimiter, 'admin-forgot-password', 5, 300),
    asyncRoute(async (request, response) => {
      const { email } = request.body as { email: string }
      setActivity(request, { action: 'admin.password-reset.request', actorEmail: email })
      await dependencies.auth.requestPasswordReset(email)
      response.status(202).json({
        message: 'If the account exists, a password reset code will be sent.',
      })
    }),
  )

  router.post(
    '/admin/auth/reset-password',
    validateQuery(),
    validateBody(schemas.resetPassword),
    rateLimit(dependencies.rateLimiter, 'admin-reset-password', 10, 300),
    asyncRoute(async (request, response) => {
      const body = request.body as { email: string; code: string; newPassword: string }
      setActivity(request, { action: 'admin.password-reset.complete', actorEmail: body.email })
      await dependencies.auth.resetPassword(body.email, body.code, body.newPassword)
      response.status(200).json(null)
    }),
  )

  router.post(
    '/admin/auth/2fa/setup',
    validateQuery(),
    validateBody(schemas.empty),
    rateLimit(dependencies.rateLimiter, 'admin-2fa-setup', 10, 300),
    asyncRoute(async (request, response) => {
      response.status(200).json(await dependencies.auth.beginTwoFactorSetup(bearerToken(request, 'setup')))
    }),
  )

  router.post(
    '/admin/auth/2fa/confirm',
    validateQuery(),
    validateBody(schemas.twoFactorCode),
    rateLimit(dependencies.rateLimiter, 'admin-2fa-confirm', 10, 300),
    asyncRoute(async (request, response) => {
      const tokens = await dependencies.auth.confirmTwoFactorSetup(
        bearerToken(request, 'setup'),
        (request.body as { code: string }).code,
      )
      setSession(response, 'admin', tokens)
      response.status(200).json(tokens)
    }),
  )

  router.post(
    '/admin/auth/2fa/verify',
    validateQuery(),
    validateBody(schemas.twoFactorCode),
    rateLimit(dependencies.rateLimiter, 'admin-2fa-verify', 10, 300),
    asyncRoute(async (request, response) => {
      const tokens = await dependencies.auth.verifyTwoFactor(
        bearerToken(request, 'challenge'),
        (request.body as { code: string }).code,
      )
      setSession(response, 'admin', tokens)
      response.status(200).json(tokens)
    }),
  )

  router.post(
    '/admin/auth/update-password',
    validateQuery(),
    validateBody(schemas.updatePassword),
    rateLimit(dependencies.rateLimiter, 'admin-update-password', 10, 300),
    authenticate(dependencies.auth),
    asyncRoute(async (request, response) => {
      const body = request.body as { currentPassword: string; newPassword: string }
      setActivity(request, { action: 'admin.password.update' })
      await dependencies.auth.updatePassword(
        authenticated(request).admin.id,
        body.currentPassword,
        body.newPassword,
      )
      response.status(200).json(null)
    }),
  )

  router.get(
    '/admin/auth/me',
    authenticate(dependencies.auth),
    validateQuery(),
    asyncRoute(async (request, response) => {
      const admin = authenticated(request).admin
      response.status(200).json({
        admin: {
          id: admin.id,
          firstName: admin.firstName,
          lastName: admin.lastName,
          email: admin.email,
          permissions: admin.permissions,
          isSuperAdmin: admin.isSuperAdmin,
          twoFactorEnabled: admin.twoFactorEnabled,
          disabledAt: admin.disabledAt,
          createdAt: admin.createdAt,
          updatedAt: admin.updatedAt,
        },
      })
    }),
  )

  router.get(
    '/admin/notifications',
    authenticate(dependencies.auth),
    validateQuery(),
    asyncRoute(async (request, response) => {
      const { cursor, limit } = request.query as { cursor?: string; limit?: string }
      setActivity(request, { action: 'admin.notifications.list' })
      response
        .status(200)
        .json(
          await dependencies.notifications.list(
            authenticated(request).admin,
            cursor,
            limit ? Number(limit) : undefined,
          ),
        )
    }),
  )

  router.post(
    '/admin/notifications/:notificationId/read',
    authenticate(dependencies.auth),
    validateParams(schemas.notificationParams),
    validateQuery(),
    validateBody(schemas.empty),
    asyncRoute(async (request, response) => {
      const notificationId = request.params.notificationId as string
      setActivity(request, { action: 'admin.notifications.read', metadata: { notificationId } })
      response.status(200).json({
        notification: await dependencies.notifications.markRead(
          authenticated(request).admin,
          notificationId,
        ),
      })
    }),
  )

  router.post(
    '/admin/notifications/read-all',
    authenticate(dependencies.auth),
    validateQuery(),
    validateBody(schemas.empty),
    asyncRoute(async (request, response) => {
      setActivity(request, { action: 'admin.notifications.read-all' })
      response
        .status(200)
        .json(await dependencies.notifications.markAllRead(authenticated(request).admin))
    }),
  )

  router.get(
    '/admin/admins',
    authenticate(dependencies.auth),
    validateQuery(),
    asyncRoute(async (request, response) => {
      setActivity(request, { action: 'admin.directory.admins.view' })
      response.status(200).json({ admins: await dependencies.directory.listAdmins() })
    }),
  )

  router.get(
    '/admin/authors',
    authenticate(dependencies.auth),
    validateQuery(),
    asyncRoute(async (request, response) => {
      setActivity(request, { action: 'admin.directory.authors.view' })
      response.status(200).json({ authors: await dependencies.directory.listAuthors() })
    }),
  )

  router.get(
    '/admin/authors/:authorId',
    authenticate(dependencies.auth),
    validateParams(schemas.authorParams),
    validateQuery(),
    asyncRoute(async (request, response) => {
      const { authorId } = request.params as { authorId: string }
      setActivity(request, { action: 'admin.directory.author.view', metadata: { authorId } })
      response.status(200).json(await dependencies.directory.getAuthor(authorId))
    }),
  )

  router.get(
    '/admin/students',
    authenticate(dependencies.auth),
    validateQuery(),
    asyncRoute(async (request, response) => {
      setActivity(request, { action: 'admin.directory.students.view' })
      response.status(200).json({ students: await dependencies.directory.listStudents() })
    }),
  )

  router.get(
    '/admin/students/:studentId',
    authenticate(dependencies.auth),
    validateParams(schemas.studentParams),
    validateQuery(),
    asyncRoute(async (request, response) => {
      const { studentId } = request.params as { studentId: string }
      setActivity(request, { action: 'admin.directory.student.view', metadata: { studentId } })
      response.status(200).json(await dependencies.directory.getStudent(studentId))
    }),
  )

  router.get(
    '/admin/courses',
    authenticate(dependencies.auth),
    validateQuery(),
    asyncRoute(async (request, response) => {
      setActivity(request, { action: 'admin.directory.courses.view' })
      response.status(200).json({ courses: await dependencies.directory.listCourses() })
    }),
  )

  router.get(
    '/admin/courses/:courseId',
    authenticate(dependencies.auth),
    validateParams(schemas.idParams),
    validateQuery(),
    asyncRoute(async (request, response) => {
      const { courseId } = request.params as { courseId: string }
      setActivity(request, { action: 'admin.directory.course.view', metadata: { courseId } })
      response.status(200).json(await dependencies.directory.getCourse(courseId))
    }),
  )

  router.post(
    '/admin/invitations',
    validateQuery(),
    validateBody(schemas.invitationList),
    rateLimit(dependencies.rateLimiter, 'admin-invitations', 10, 60),
    authenticate(dependencies.auth),
    requirePermission('invite_admin'),
    asyncRoute(async (request, response) => {
      const emails = (request.body as { emails: string[] }).emails
      setActivity(request, {
        action: 'admin.invitations.create',
        metadata: { count: emails.length },
      })
      const results = await dependencies.invitations.invite(authenticated(request).admin, emails)
      response.status(202).json({ invitations: results })
    }),
  )

  router.get(
    '/admin/invitations',
    authenticate(dependencies.auth),
    requirePermission('invite_admin'),
    validateQuery(),
    asyncRoute(async (request, response) => {
      const invitations = await dependencies.invitations.list(authenticated(request).admin)
      response.status(200).json({
        invitations: invitations.map(({ tokenHash: _tokenHash, ...invitation }) => invitation),
      })
    }),
  )

  router.post(
    '/admin/invitations/accept',
    validateQuery(),
    validateBody(schemas.acceptInvitation),
    asyncRoute(async (request, response) => {
      const body = request.body as {
        token: string
        firstName: string
        lastName: string
        password: string
      }
      setActivity(request, { action: 'admin.invitation.accept' })
      await dependencies.invitations.accept(body.token, body)
      response.status(201).json({ message: 'Admin account created' })
    }),
  )

  return router
}

const authenticate = (auth: AdminAuthService) =>
  asyncRoute(async (request, _response, next) => {
    const admin = await auth.authenticate(bearerToken(request))
    Object.assign(request, { admin })
    setActivity(request, { actorType: 'admin', actorId: admin.id, actorEmail: admin.email })
    next()
  })

const requirePermission =
  (permission: Permission) =>
  (request: Request, _response: Response, next: NextFunction): void => {
    const admin = authenticated(request).admin
    if (!admin.isSuperAdmin && !admin.permissions.includes(permission)) {
      next(new ApplicationError('You do not have the required permission', 'FORBIDDEN', 403))
      return
    }
    next()
  }

const rateLimit = (limiter: RateLimiter, scope: string, limit: number, windowSeconds: number) =>
  asyncRoute(async (request, _response, next) => {
    const allowed = await limiter.consume(`${scope}:${request.ip}`, limit, windowSeconds)
    if (!allowed) {
      throw new ApplicationError('Too many requests; try again later', 'RATE_LIMITED', 429)
    }
    next()
  })

const asyncRoute =
  (handler: AsyncHandler) =>
  (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next)
  }

const bearerToken = (request: Request, kind: 'access' | 'refresh' | 'challenge' | 'setup' = 'access') =>
  sessionToken(request, 'admin', kind)

const authenticated = (request: Request): AuthenticatedRequest => request as AuthenticatedRequest
