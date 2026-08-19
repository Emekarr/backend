import { Router, type NextFunction, type Request, type Response } from 'express'
import type { AdminAuthService } from '../../../application/auth/AdminAuthService'
import type { AuthorAuthService } from '../../../application/author/AuthorAuthService'
import type { CourseService } from '../../../application/course/CourseService'
import type { CourseParticipationService } from '../../../application/student/CourseParticipationService'
import type {
  StudentAuthService,
  StudentProfileUpdate,
} from '../../../application/student/StudentAuthService'
import type { StudentInvitationService } from '../../../application/student/StudentInvitationService'
import type { RateLimiter } from '../../../entities/interfaces/auth'
import type { Admin } from '../../../entities/models/Admin'
import type { Author } from '../../../entities/models/Author'
import type { Student } from '../../../entities/models/Student'
import { ApplicationError } from '../../../entities/errors/applicationError'
import { setActivity } from '../activityAudit'
import {
  clearSession,
  sessionToken,
  setChallenge,
  setSession,
  setSetup,
} from '../sessionCookies'
import { schemas, validateBody, validateParams, validateQuery } from '../../validation/joi'

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>
type StudentRequest = Request & { student: Student }
type AdminRequest = Request & { admin: Admin }
type AuthorRequest = Request & { author: Author }

export const createStudentRouter = (dependencies: {
  studentAuth: StudentAuthService
  adminAuth: AdminAuthService
  authorAuth: AuthorAuthService
  invitations: StudentInvitationService
  participation: CourseParticipationService
  courses: CourseService
  rateLimiter: RateLimiter
}): Router => {
  const router = Router()

  router.post(
    '/student/auth/login',
    validateQuery(),
    validateBody(schemas.login),
    limit(dependencies.rateLimiter, 'student-login', 10, 60),
    asyncRoute(async (request, response) => {
      const body = request.body as { email: string; password: string }
      setActivity(request, { action: 'student.login', actorEmail: body.email })
      const result = await dependencies.studentAuth.login(body.email, body.password)
      if (result.status === 'two-factor-required') setChallenge(response, 'student', result.challengeToken)
      else setSetup(response, 'student', result.setupToken)
      const next = result.status === 'two-factor-required' ? '/two-factor' : '/two-factor/setup'
      response.status(202).json({ ...result, next })
    }),
  )

  router.post(
    '/student/auth/refresh',
    validateQuery(),
    validateBody(schemas.empty),
    limit(dependencies.rateLimiter, 'student-refresh', 30, 60),
    asyncRoute(async (request, response) => {
      const tokens = await dependencies.studentAuth.refresh(bearer(request, 'refresh'))
setSession(response, 'student', tokens)
      response.json({ ...tokens, next: '/dashboard' })
    }),
  )

  router.post(
    '/student/auth/logout',
    validateQuery(),
    validateBody(schemas.empty),
    asyncRoute(async (request, response) => {
      await dependencies.studentAuth.logout(bearer(request, 'refresh'))
      clearSession(response, 'student')
      response.status(200).json(null)
    }),
  )

  router.post(
    '/student/auth/forgot-password',
    validateQuery(),
    validateBody(schemas.email),
    limit(dependencies.rateLimiter, 'student-forgot-password', 5, 300),
    asyncRoute(async (request, response) => {
      const { email } = request.body as { email: string }
      setActivity(request, { action: 'student.password-reset.request', actorEmail: email })
      await dependencies.studentAuth.requestPasswordReset(email)
      response.status(202).json({ message: 'If the account exists, a reset code will be sent.' })
    }),
  )

  router.post(
    '/student/auth/reset-password',
    validateQuery(),
    validateBody(schemas.resetPassword),
    limit(dependencies.rateLimiter, 'student-reset-password', 10, 300),
    asyncRoute(async (request, response) => {
      const body = request.body as { email: string; code: string; newPassword: string }
      setActivity(request, { action: 'student.password-reset.complete', actorEmail: body.email })
      await dependencies.studentAuth.resetPassword(body.email, body.code, body.newPassword)
      response.status(200).json(null)
    }),
  )

  router.post(
    '/student/auth/2fa/setup',
    validateQuery(),
    validateBody(schemas.empty),
    limit(dependencies.rateLimiter, 'student-2fa-setup', 10, 300),
    asyncRoute(async (request, response) => {
      response.json(await dependencies.studentAuth.beginTwoFactorSetup(bearer(request, 'setup')))
    }),
  )

  router.post(
    '/student/auth/2fa/confirm',
    validateQuery(),
    validateBody(schemas.twoFactorCode),
    limit(dependencies.rateLimiter, 'student-2fa-confirm', 10, 300),
    asyncRoute(async (request, response) => {
      const tokens = await dependencies.studentAuth.confirmTwoFactorSetup(
        bearer(request, 'setup'),
        (request.body as { code: string }).code,
      )
      setSession(response, 'student', tokens)
      response.json({ ...tokens, next: '/dashboard' })
    }),
  )

  router.post(
    '/student/auth/2fa/verify',
    validateQuery(),
    validateBody(schemas.twoFactorCode),
    limit(dependencies.rateLimiter, 'student-2fa-verify', 10, 300),
    asyncRoute(async (request, response) => {
      const tokens = await dependencies.studentAuth.verifyTwoFactor(
        bearer(request, 'challenge'),
        (request.body as { code: string }).code,
      )
      setSession(response, 'student', tokens)
      response.json({ ...tokens, next: '/dashboard' })
    }),
  )

  router.get(
    '/student/courses/:courseId/attachments/:attachmentId/view',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateParams(schemas.courseAttachmentParams),
    asyncRoute(async (request, response) => {
      const courseId = request.params.courseId as string
      const attachmentId = request.params.attachmentId as string
      await dependencies.participation.courseView((request as StudentRequest).student, courseId)
      setActivity(request, {
        action: 'course.attachment.view',
        metadata: { courseId, attachmentId },
      })
      response.json(await dependencies.courses.createAttachmentView(courseId, attachmentId))
    }),
  )

  router.get(
    '/student/auth/me',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    asyncRoute(async (request, response) => {
      const student = (request as StudentRequest).student
      response.json({
        student: {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          email: student.email,
          bio: student.bio,
          linkedInUrl: student.linkedInUrl,
          xUrl: student.xUrl,
          facebookUrl: student.facebookUrl,
          instagramUrl: student.instagramUrl,
          youtubeUrl: student.youtubeUrl,
          websiteUrl: student.websiteUrl,
          twoFactorEnabled: student.twoFactorEnabled,
          createdAt: student.createdAt,
          updatedAt: student.updatedAt,
        },
      })
    }),
  )

  router.put(
    '/student/profile',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateBody(schemas.studentProfile),
    asyncRoute(async (request, response) => {
      const updated = await dependencies.studentAuth.updateProfile(
        (request as StudentRequest).student.id,
        request.body as StudentProfileUpdate,
      )
      setActivity(request, { action: 'student.profile.update' })
      response.status(200).json({
        student: {
          id: updated.id,
          firstName: updated.firstName,
          lastName: updated.lastName,
          email: updated.email,
          bio: updated.bio,
          linkedInUrl: updated.linkedInUrl,
          xUrl: updated.xUrl,
          facebookUrl: updated.facebookUrl,
          instagramUrl: updated.instagramUrl,
          youtubeUrl: updated.youtubeUrl,
          websiteUrl: updated.websiteUrl,
          twoFactorEnabled: updated.twoFactorEnabled,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        },
      })
    }),
  )

  router.post(
    '/student/auth/update-password',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateBody(schemas.updatePassword),
    limit(dependencies.rateLimiter, 'student-update-password', 10, 300),
    asyncRoute(async (request, response) => {
      const body = request.body as { currentPassword: string; newPassword: string }
      setActivity(request, { action: 'student.password.update' })
      await dependencies.studentAuth.updatePassword(
        (request as StudentRequest).student.id,
        body.currentPassword,
        body.newPassword,
      )
      response.status(200).json(null)
    }),
  )

  router.post(
    '/student/invitations/accept',
    validateQuery(),
    validateBody(schemas.acceptInvitation),
    limit(dependencies.rateLimiter, 'student-invitation-accept', 10, 300),
    asyncRoute(async (request, response) => {
      const body = request.body as {
        token: string
        firstName: string
        lastName: string
        password: string
      }
      setActivity(request, { action: 'student.invitation.accept' })
      response.status(201).json(await dependencies.invitations.acceptNew(body.token, body))
    }),
  )

  router.post(
    '/student/invitations/accept-existing',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateBody(schemas.invitationToken),
    limit(dependencies.rateLimiter, 'student-invitation-accept-existing', 10, 300),
    asyncRoute(async (request, response) => {
      setActivity(request, { action: 'student.invitation.accept-existing' })
      response.json(
        await dependencies.invitations.acceptExisting(
          (request as StudentRequest).student,
          (request.body as { token: string }).token,
        ),
      )
    }),
  )

  router.post(
    '/admin/student-invitations',
    authenticateAdmin(dependencies.adminAuth),
    validateQuery(),
    validateBody(schemas.invitationList),
    limit(dependencies.rateLimiter, 'admin-student-invitations', 10, 60),
    asyncRoute(async (request, response) => {
      const body = request.body as { emails: string[] }
      setActivity(request, {
        action: 'student.invitations.create',
        metadata: { count: body.emails.length },
      })
      response.status(202).json({
        invitations: await dependencies.invitations.invite(
          (request as AdminRequest).admin,
          'admin',
          body.emails,
        ),
      })
    }),
  )

  router.get(
    '/admin/student-invitations',
    authenticateAdmin(dependencies.adminAuth),
    validateQuery(),
    asyncRoute(async (request, response) => {
      const items = await dependencies.invitations.list((request as AdminRequest).admin, 'admin')
      response.json({ invitations: items.map(({ tokenHash: _hash, ...item }) => item) })
    }),
  )

  router.post(
    '/author/student-invitations',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateBody(schemas.courseInvitationList),
    limit(dependencies.rateLimiter, 'author-student-invitations', 10, 60),
    asyncRoute(async (request, response) => {
      const body = request.body as { courseId: string; emails: string[] }
      setActivity(request, {
        action: 'student.invitations.create',
        metadata: { courseId: body.courseId, count: body.emails.length },
      })
      response.status(202).json({
        invitations: await dependencies.invitations.invite(
          (request as AuthorRequest).author,
          'author',
          body.emails,
          body.courseId,
        ),
      })
    }),
  )

  router.get(
    '/author/student-invitations',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    asyncRoute(async (request, response) => {
      const items = await dependencies.invitations.list((request as AuthorRequest).author, 'author')
      response.json({ invitations: items.map(({ tokenHash: _hash, ...item }) => item) })
    }),
  )

  router.post(
    '/student/courses/:courseId/enroll',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateParams(schemas.idParams),
    validateBody(schemas.empty),
    asyncRoute(async (request, response) => {
      const courseId = request.params.courseId as string
      setActivity(request, { action: 'course.enroll', metadata: { courseId } })
      response
        .status(201)
        .json(
          await dependencies.participation.enroll((request as StudentRequest).student, courseId),
        )
    }),
  )

  router.get(
    '/student/courses',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    asyncRoute(async (request, response) => {
      response.json({
        enrollments: await dependencies.participation.listMine((request as StudentRequest).student),
      })
    }),
  )

  router.get(
    '/student/courses/:courseId',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateParams(schemas.idParams),
    asyncRoute(async (request, response) => {
      const courseId = request.params.courseId as string
      setActivity(request, { action: 'course.access', metadata: { courseId } })
      response.json(
        await dependencies.participation.courseView((request as StudentRequest).student, courseId),
      )
    }),
  )

  router.post(
    '/student/courses/:courseId/modules/:moduleId/complete',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateParams(schemas.courseModuleParams),
    validateBody(schemas.empty),
    asyncRoute(async (request, response) => {
      const courseId = request.params.courseId as string
      const moduleId = request.params.moduleId as string
      setActivity(request, { action: 'course.module.complete', metadata: { courseId, moduleId } })
      response.json(
        await dependencies.participation.completeModule(
          (request as StudentRequest).student,
          courseId,
          moduleId,
        ),
      )
    }),
  )

  router.post(
    '/student/courses/:courseId/author-rating',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateParams(schemas.idParams),
    validateBody(schemas.authorRating),
    asyncRoute(async (request, response) => {
      const courseId = request.params.courseId as string
      const rating = (request.body as { rating: number }).rating
      setActivity(request, { action: 'author.rating.submit', metadata: { courseId, rating } })
      response.json(
        await dependencies.participation.rateAuthor(
          (request as StudentRequest).student,
          courseId,
          rating,
        ),
      )
    }),
  )

  router.get(
    '/student/courses/:courseId/attachments/:attachmentId/download',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateParams(schemas.courseAttachmentParams),
    asyncRoute(async (request, response) => {
      const courseId = request.params.courseId as string
      const attachmentId = request.params.attachmentId as string
      await dependencies.participation.courseView((request as StudentRequest).student, courseId)
      setActivity(request, {
        action: 'course.attachment.download',
        metadata: { courseId, attachmentId },
      })
      response.json(await dependencies.courses.createAttachmentDownload(courseId, attachmentId))
    }),
  )

  return router
}

export const authenticateStudent = (auth: StudentAuthService) =>
  asyncRoute(async (request, _response, next) => {
    const student = await auth.authenticate(bearer(request))
    Object.assign(request, { student })
    setActivity(request, { actorType: 'student', actorId: student.id, actorEmail: student.email })
    next()
  })

const authenticateAdmin = (auth: AdminAuthService) =>
  asyncRoute(async (request, _response, next) => {
    const admin = await auth.authenticate(sessionToken(request, 'admin'))
    Object.assign(request, { admin })
    setActivity(request, { actorType: 'admin', actorId: admin.id, actorEmail: admin.email })
    next()
  })

const authenticateAuthor = (auth: AuthorAuthService) =>
  asyncRoute(async (request, _response, next) => {
    const author = await auth.authenticate(sessionToken(request, 'author'))
    Object.assign(request, { author })
    setActivity(request, { actorType: 'author', actorId: author.id, actorEmail: author.email })
    next()
  })

const limit = (limiter: RateLimiter, scope: string, maximum: number, seconds: number) =>
  asyncRoute(async (request, _response, next) => {
    if (!(await limiter.consume(`${scope}:${request.ip}`, maximum, seconds)))
      throw new ApplicationError('Too many requests; try again later', 'RATE_LIMITED', 429)
    next()
  })

const bearer = (request: Request, kind: 'access' | 'refresh' | 'challenge' | 'setup' = 'access') =>
  sessionToken(request, 'student', kind)

const asyncRoute =
  (handler: AsyncHandler) =>
  (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next)
  }

export const authenticatedStudent = (request: Request): Student =>
  (request as StudentRequest).student
