import { Router, type NextFunction, type Request, type Response } from 'express'
import type { AuthorAuthService } from '../../../application/author/AuthorAuthService'
import type {
  CourseService,
  CreateCourseInput,
  UpdateCourseInput,
} from '../../../application/course/CourseService'
import type { CourseParticipationService } from '../../../application/student/CourseParticipationService'
import type { LiveReminderService } from '../../../application/course/LiveReminderService'
import { setActivity } from '../activityAudit'
import { authenticatedAuthor, authenticateAuthor } from './authorRoutes'
import { schemas, validateBody, validateParams, validateQuery } from '../../validation/joi'

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>

export const createCourseRouter = (dependencies: {
  authorAuth: AuthorAuthService
  courses: CourseService
  participation: CourseParticipationService
  reminders: LiveReminderService
}): Router => {
  const router = Router()
  router.get(
    '/author/courses',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    asyncRoute(async (request, response) => {
      setActivity(request, { action: 'course.list-owned' })
      response.json({ courses: await dependencies.courses.listOwned(authenticatedAuthor(request)) })
    }),
  )

  router.put(
    '/author/courses/:courseId/reminder-preferences',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateParams(schemas.idParams),
    validateBody(schemas.reminderPreference),
    asyncRoute(async (request, response) => {
      const body = request.body as { enabled: boolean }
      const courseId = request.params.courseId as string
      setActivity(request, {
        action: 'course.reminder-preference.update',
        metadata: { courseId, enabled: body.enabled },
      })
      response.status(200).json({
        preference: await dependencies.reminders.set(
          authenticatedAuthor(request),
          courseId,
          body.enabled,
        ),
      })
    }),
  )

  router.get(
    '/author/courses/reminder-preferences',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    asyncRoute(async (request, response) => {
      setActivity(request, { action: 'course.reminder-preference.list' })
      response.status(200).json(await dependencies.reminders.list(authenticatedAuthor(request)))
    }),
  )

  router.post(
    '/author/courses',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateBody(schemas.course),
    asyncRoute(async (request, response) => {
      const body = request.body as Omit<CreateCourseInput, 'scheduledAt'> & {
        scheduledAt?: string | null
      }
      setActivity(request, { action: 'course.create', metadata: { courseName: body.name } })
      const course = await dependencies.courses.create(authenticatedAuthor(request), {
        ...body,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      })
      response.status(201).json(course)
    }),
  )

  router.patch(
    '/author/courses/:courseId',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateParams(schemas.idParams),
    validateBody(schemas.courseUpdate),
    asyncRoute(async (request, response) => {
      const courseId = request.params.courseId as string
      const body = request.body as Omit<UpdateCourseInput, 'scheduledAt'> & {
        scheduledAt: string | null
      }
      setActivity(request, { action: 'course.update', metadata: { courseId } })
      response.status(200).json(
        await dependencies.courses.update(authenticatedAuthor(request), courseId, {
          ...body,
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        }),
      )
    }),
  )

  router.get(
    '/author/courses/:courseId/participants',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateParams(schemas.idParams),
    asyncRoute(async (request, response) => {
      const courseId = request.params.courseId as string
      setActivity(request, { action: 'course.participants.list', metadata: { courseId } })
      response.json({
        participants: await dependencies.participation.listParticipants(
          authenticatedAuthor(request),
          courseId,
        ),
      })
    }),
  )

  router.post(
    '/author/courses/:courseId/modules',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateParams(schemas.idParams),
    validateBody(schemas.module),
    asyncRoute(async (request, response) => {
      const courseId = request.params.courseId as string
      setActivity(request, { action: 'course.module.add', metadata: { courseId } })
      response.status(201).json({
        module: await dependencies.courses.addModule(
          authenticatedAuthor(request),
          courseId,
          request.body as { title: string; content: string },
        ),
      })
    }),
  )

  router.post(
    '/author/courses/:courseId/attachments',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateParams(schemas.idParams),
    validateBody(schemas.attachment),
    asyncRoute(async (request, response) => {
      const courseId = request.params.courseId as string
      setActivity(request, { action: 'course.attachment.add', metadata: { courseId } })
      response.status(201).json({
        attachment: await dependencies.courses.addAttachment(
          authenticatedAuthor(request),
          courseId,
          request.body as { attachmentPath: string; fileName?: string | null },
        ),
      })
    }),
  )

  router.post(
    '/author/uploads/sign',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateBody(schemas.upload),
    asyncRoute(async (request, response) => {
      setActivity(request, { action: 'upload.sign' })
      response
        .status(201)
        .json(
          await dependencies.courses.createSignedUpload(
            authenticatedAuthor(request),
            request.body as { fileName: string; contentType: string; sizeBytes: number },
          ),
        )
    }),
  )

  router.get(
    '/courses',
    validateQuery(schemas.catalog),
    asyncRoute(async (request, response) => {
      setActivity(request, { action: 'course.catalog.access' })
      response.json({ courses: await dependencies.courses.listAvailable(String(request.query.query ?? '')) })
    }),
  )

  router.get(
    '/courses/:courseId',
    validateQuery(),
    validateParams(schemas.idParams),
    asyncRoute(async (request, response) => {
      const courseId = request.params.courseId as string
      setActivity(request, { action: 'course.preview', metadata: { courseId } })
      response.json(await dependencies.courses.getPreview(courseId))
    }),
  )

  router.get(
    '/authors/:authorId',
    validateQuery(),
    validateParams(schemas.authorParams),
    asyncRoute(async (request, response) => {
      const authorId = request.params.authorId as string
      setActivity(request, { action: 'author.public-profile.access', metadata: { authorId } })
      response.json(await dependencies.courses.getPublicAuthorProfile(authorId))
    }),
  )

  return router
}

const asyncRoute =
  (handler: AsyncHandler) =>
  (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next)
  }
