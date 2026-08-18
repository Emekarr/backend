import { Router, type NextFunction, type Request, type Response } from 'express'
import type { AuthorAuthService } from '../../../application/author/AuthorAuthService'
import type { LiveClassService } from '../../../application/live/LiveClassService'
import type { StudentAuthService } from '../../../application/student/StudentAuthService'
import type {
  LiveActorType,
  LiveMessageKind,
  LiveRecordingType,
} from '../../../entities/models/LiveClass'
import { schemas, validateBody, validateParams, validateQuery } from '../../validation/joi'
import { authenticateAuthor, authenticatedAuthor } from './authorRoutes'
import { authenticateStudent, authenticatedStudent } from './studentRoutes'

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>

export const createLiveClassRouter = (dependencies: {
  authorAuth: AuthorAuthService
  studentAuth: StudentAuthService
  live: LiveClassService
}): Router => {
  const router = Router()

  router.get(
    '/author/live-sessions',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    asyncRoute(async (request, response) => {
      response.json({
        sessions: await dependencies.live.listAuthorSessions(authenticatedAuthor(request)),
      })
    }),
  )
  router.post(
    '/author/live-sessions',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateBody(schemas.liveSessionCreate),
    asyncRoute(async (request, response) => {
      const body = request.body as {
        courseId: string | null
        scheduledAt?: string | null
        durationMinutes: number
      }
      response.status(201).json({
        session: await dependencies.live.createSession(authenticatedAuthor(request), {
          courseId: body.courseId,
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
          durationMinutes: body.durationMinutes,
        }),
      })
    }),
  )
  router.get(
    '/author/live-sessions/:sessionId',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateParams(schemas.sessionParams),
    asyncRoute(async (request, response) => {
      response.json({
        session: await dependencies.live.getAuthorSessionById(
          authenticatedAuthor(request),
          request.params.sessionId as string,
        ),
      })
    }),
  )

  router.post(
    '/author/courses/:courseId/live-session',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateParams(schemas.idParams),
    validateBody(schemas.empty),
    asyncRoute(async (request, response) => {
      response.status(201).json({
        session: await dependencies.live.authorSession(
          authenticatedAuthor(request),
          request.params.courseId as string,
        ),
      })
    }),
  )
  router.get(
    '/author/courses/:courseId/live-session',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateParams(schemas.idParams),
    asyncRoute(async (request, response) => {
      response.json({
        session: await dependencies.live.getAuthorSession(
          authenticatedAuthor(request),
          request.params.courseId as string,
        ),
      })
    }),
  )
  router.post(
    '/author/live-sessions/:sessionId/start',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateParams(schemas.sessionParams),
    validateBody(schemas.empty),
    asyncRoute(async (request, response) => {
      response.json({
        session: await dependencies.live.startSession(
          authenticatedAuthor(request),
          request.params.sessionId as string,
        ),
      })
    }),
  )
  router.post(
    '/author/live-sessions/:sessionId/end',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateParams(schemas.sessionParams),
    validateBody(schemas.empty),
    asyncRoute(async (request, response) => {
      response.json({
        session: await dependencies.live.endSession(
          authenticatedAuthor(request),
          request.params.sessionId as string,
        ),
      })
    }),
  )
  router.post(
    '/author/live-sessions/:sessionId/join',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateParams(schemas.sessionParams),
    validateBody(schemas.empty),
    asyncRoute(async (request, response) => {
      response.json(
        await dependencies.live.joinAuthor(
          authenticatedAuthor(request),
          request.params.sessionId as string,
        ),
      )
    }),
  )
  router.get(
    '/author/live-sessions/:sessionId/state',
    authenticateAuthor(dependencies.authorAuth),
    validateParams(schemas.sessionParams),
    asyncRoute(async (request, response) => {
      response.json(
        await dependencies.live.stateForAuthor(
          authenticatedAuthor(request),
          request.params.sessionId as string,
        ),
      )
    }),
  )
  router.patch(
    '/author/live-sessions/:sessionId/me',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateParams(schemas.sessionParams),
    validateBody(schemas.liveParticipantState),
    asyncRoute(async (request, response) => {
      response.json({
        participant: await dependencies.live.updateSelf(
          authenticatedAuthor(request),
          'author',
          request.params.sessionId as string,
          request.body as never,
        ),
      })
    }),
  )
  router.post(
    '/author/live-sessions/:sessionId/messages',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateParams(schemas.sessionParams),
    validateBody(schemas.liveMessage),
    asyncRoute(async (request, response) => {
      const body = request.body as { kind: LiveMessageKind; body: string }
      response.status(201).json({
        message: await dependencies.live.message(
          authenticatedAuthor(request),
          'author',
          request.params.sessionId as string,
          body.kind,
          body.body,
        ),
      })
    }),
  )
  router.post(
    '/author/live-sessions/:sessionId/moderate',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateParams(schemas.sessionParams),
    validateBody(schemas.liveModeration),
    asyncRoute(async (request, response) => {
      await dependencies.live.moderate(
        authenticatedAuthor(request),
        request.params.sessionId as string,
        request.body as never,
      )
      response.status(200).json(null)
    }),
  )
  router.post(
    '/author/live-sessions/:sessionId/recordings',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateParams(schemas.sessionParams),
    validateBody(schemas.liveRecording),
    asyncRoute(async (request, response) => {
      response.status(201).json({
        recording: await dependencies.live.startRecording(
          authenticatedAuthor(request),
          request.params.sessionId as string,
          (request.body as { type: LiveRecordingType }).type,
        ),
      })
    }),
  )
  router.post(
    '/author/live-sessions/:sessionId/recordings/:recordingId/stop',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateParams(schemas.sessionRecordingParams),
    validateBody(schemas.empty),
    asyncRoute(async (request, response) => {
      response.json({
        recording: await dependencies.live.stopRecording(
          authenticatedAuthor(request),
          request.params.sessionId as string,
          request.params.recordingId as string,
        ),
      })
    }),
  )
  router.get(
    '/author/courses/:courseId/recordings',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateParams(schemas.idParams),
    asyncRoute(async (request, response) => {
      response.json({
        recordings: await dependencies.live.listRecordingsForAuthor(
          authenticatedAuthor(request),
          request.params.courseId as string,
        ),
      })
    }),
  )

  router.get(
    '/student/courses/:courseId/live-session',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateParams(schemas.idParams),
    asyncRoute(async (request, response) => {
      response.json({
        session: await dependencies.live.getStudentSession(
          authenticatedStudent(request),
          request.params.courseId as string,
        ),
      })
    }),
  )
  router.post(
    '/student/live-sessions/:sessionId/join',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateParams(schemas.sessionParams),
    validateBody(schemas.empty),
    asyncRoute(async (request, response) => {
      response.json(
        await dependencies.live.joinStudent(
          authenticatedStudent(request),
          request.params.sessionId as string,
        ),
      )
    }),
  )
  router.post(
    '/student/live-sessions/:sessionId/leave',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateParams(schemas.sessionParams),
    validateBody(schemas.empty),
    asyncRoute(async (request, response) => {
      await dependencies.live.leave(
        authenticatedStudent(request),
        'student',
        request.params.sessionId as string,
      )
      response.status(200).json(null)
    }),
  )
  router.get(
    '/student/live-sessions/:sessionId/state',
    authenticateStudent(dependencies.studentAuth),
    validateParams(schemas.sessionParams),
    asyncRoute(async (request, response) => {
      const after =
        typeof request.query.after === 'string' ? new Date(request.query.after) : undefined
      response.json(
        await dependencies.live.stateForStudent(
          authenticatedStudent(request),
          request.params.sessionId as string,
          after,
        ),
      )
    }),
  )
  router.patch(
    '/student/live-sessions/:sessionId/me',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateParams(schemas.sessionParams),
    validateBody(schemas.liveParticipantState),
    asyncRoute(async (request, response) => {
      response.json({
        participant: await dependencies.live.updateSelf(
          authenticatedStudent(request),
          'student',
          request.params.sessionId as string,
          request.body as never,
        ),
      })
    }),
  )
  router.post(
    '/student/live-sessions/:sessionId/messages',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateParams(schemas.sessionParams),
    validateBody(schemas.liveMessage),
    asyncRoute(async (request, response) => {
      const body = request.body as { kind: LiveMessageKind; body: string }
      response.status(201).json({
        message: await dependencies.live.message(
          authenticatedStudent(request),
          'student',
          request.params.sessionId as string,
          body.kind,
          body.body,
        ),
      })
    }),
  )
  router.get(
    '/student/courses/:courseId/recordings',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateParams(schemas.idParams),
    asyncRoute(async (request, response) => {
      response.json({
        recordings: await dependencies.live.listRecordingsForStudent(
          authenticatedStudent(request),
          request.params.courseId as string,
        ),
      })
    }),
  )
  router.post(
    '/student/courses/:courseId/recordings/:recordingId/playback',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateParams(schemas.courseRecordingParams),
    validateBody(schemas.empty),
    asyncRoute(async (request, response) => {
      response.json(
        await dependencies.live.playback(
          authenticatedStudent(request),
          request.params.courseId as string,
          request.params.recordingId as string,
        ),
      )
    }),
  )

  router.get(
    '/live-recorder/:sessionId/bootstrap',
    validateParams(schemas.sessionParams),
    asyncRoute(async (request, response) => {
      response.json(
        await dependencies.live.recorderBootstrap(
          request.params.sessionId as string,
          String(request.query.token ?? ''),
        ),
      )
    }),
  )

  return router
}

const asyncRoute =
  (handler: AsyncHandler) =>
  (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next)
  }
