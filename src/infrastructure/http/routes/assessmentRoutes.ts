import { Router, type NextFunction, type Request, type Response } from 'express'
import type {
  AssessmentService,
  CreateAssessmentInput,
  SubmitAssessmentInput,
} from '../../../application/assessment/AssessmentService'
import type { AuthorAuthService } from '../../../application/author/AuthorAuthService'
import type { StudentAuthService } from '../../../application/student/StudentAuthService'
import { setActivity } from '../activityAudit'
import { schemas, validateBody, validateParams, validateQuery } from '../../validation/joi'
import { authenticateAuthor, authenticatedAuthor } from './authorRoutes'
import { authenticateStudent, authenticatedStudent } from './studentRoutes'

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>

export const createAssessmentRouter = (dependencies: {
  authorAuth: AuthorAuthService
  studentAuth: StudentAuthService
  assessments: AssessmentService
}): Router => {
  const router = Router()

  router.get(
    '/author/assessments',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    asyncRoute(async (request, response) => {
      response.json({
        assessments: await dependencies.assessments.listOwned(authenticatedAuthor(request)),
      })
    }),
  )

  router.post(
    '/author/assessments',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateBody(schemas.assessment),
    asyncRoute(async (request, response) => {
      const body = request.body as Omit<CreateAssessmentInput, 'opensAt' | 'closesAt'> & {
        opensAt: string
        closesAt: string
      }
      setActivity(request, { action: 'assessment.create', metadata: { title: body.title } })
      response.status(201).json(
        await dependencies.assessments.create(authenticatedAuthor(request), {
          ...body,
          opensAt: new Date(body.opensAt),
          closesAt: new Date(body.closesAt),
        }),
      )
    }),
  )

  router.get(
    '/author/assessments/:assessmentId',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateParams(schemas.assessmentParams),
    asyncRoute(async (request, response) => {
      response.json(
        await dependencies.assessments.getOwned(
          authenticatedAuthor(request),
          request.params.assessmentId as string,
        ),
      )
    }),
  )

  router.get(
    '/author/assessments/:assessmentId/submissions',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateParams(schemas.assessmentParams),
    asyncRoute(async (request, response) => {
      response.json({
        submissions: await dependencies.assessments.listSubmissions(
          authenticatedAuthor(request),
          request.params.assessmentId as string,
        ),
      })
    }),
  )

  router.post(
    '/author/assessments/:assessmentId/submissions/:attemptId/review',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    validateParams(schemas.assessmentAttemptParams),
    validateBody(schemas.assessmentReview),
    asyncRoute(async (request, response) => {
      const assessmentId = request.params.assessmentId as string
      const attemptId = request.params.attemptId as string
      setActivity(request, {
        action: 'assessment.submission.review',
        metadata: { assessmentId, attemptId },
      })
      response.json(
        await dependencies.assessments.review(
          authenticatedAuthor(request),
          assessmentId,
          attemptId,
          (request.body as { grades: Parameters<AssessmentService['review']>[3] }).grades,
        ),
      )
    }),
  )

  router.get(
    '/student/assessments',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    asyncRoute(async (request, response) => {
      response.json({
        assessments: await dependencies.assessments.listAvailable(authenticatedStudent(request)),
      })
    }),
  )

  router.get(
    '/student/assessments/:assessmentId',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateParams(schemas.assessmentParams),
    asyncRoute(async (request, response) => {
      response.json(
        await dependencies.assessments.getAvailable(
          authenticatedStudent(request),
          request.params.assessmentId as string,
        ),
      )
    }),
  )

  router.post(
    '/student/assessments/:assessmentId/start',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateParams(schemas.assessmentParams),
    validateBody(schemas.empty),
    asyncRoute(async (request, response) => {
      const assessmentId = request.params.assessmentId as string
      setActivity(request, { action: 'assessment.start', metadata: { assessmentId } })
      response
        .status(201)
        .json(await dependencies.assessments.start(authenticatedStudent(request), assessmentId))
    }),
  )

  router.get(
    '/student/assessment-attempts/:attemptId',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateParams(schemas.attemptParams),
    asyncRoute(async (request, response) => {
      response.json(
        await dependencies.assessments.getAttempt(
          authenticatedStudent(request),
          request.params.attemptId as string,
        ),
      )
    }),
  )

  router.post(
    '/student/assessment-attempts/:attemptId/submit',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateParams(schemas.attemptParams),
    validateBody(schemas.assessmentSubmission),
    asyncRoute(async (request, response) => {
      const attemptId = request.params.attemptId as string
      setActivity(request, { action: 'assessment.submit', metadata: { attemptId } })
      response.json(
        await dependencies.assessments.submit(
          authenticatedStudent(request),
          attemptId,
          request.body as SubmitAssessmentInput,
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
