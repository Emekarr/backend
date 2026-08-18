import { Router, type NextFunction, type Request, type Response } from 'express'
import type {
  CoursePaymentService,
  PaystackEvent,
} from '../../../application/payment/CoursePaymentService'
import { ApplicationError } from '../../../entities/errors/applicationError'
import type { RateLimiter } from '../../../entities/interfaces/auth'
import type { Student } from '../../../entities/models/Student'
import type { StudentAuthService } from '../../../application/student/StudentAuthService'
import type { AuthorAuthService } from '../../../application/author/AuthorAuthService'
import type { Author } from '../../../entities/models/Author'
import { setActivity } from '../activityAudit'
import { schemas, validateBody, validateParams, validateQuery } from '../../validation/joi'
import { authenticateStudent } from './studentRoutes'
import { authenticateAuthor } from './authorRoutes'

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>
type StudentRequest = Request & { student: Student }
type AuthorRequest = Request & { author: Author }
type RawRequest = Request & { rawBody?: Buffer }

export const createPaymentRouter = (dependencies: {
  payments: CoursePaymentService
  studentAuth: StudentAuthService
  authorAuth: AuthorAuthService
  rateLimiter: RateLimiter
}): Router => {
  const router = Router()

  router.post(
    '/student/courses/:courseId/payments/paystack/initialize',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateParams(schemas.idParams),
    validateBody(schemas.paymentInitialization),
    limit(dependencies.rateLimiter, 'paystack-initialize', 10, 60),
    asyncRoute(async (request, response) => {
      const courseId = request.params.courseId as string
      const body = request.body as {
        paymentMethodId?: string | null
        savePaymentMethod: boolean
        callbackUrl: string
      }
      setActivity(request, { action: 'payment.initialize', metadata: { courseId } })
      response
        .status(201)
        .json(
          await dependencies.payments.initialize(
            (request as StudentRequest).student,
            courseId,
            body,
          ),
        )
    }),
  )

  router.get(
    '/student/payments',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    asyncRoute(async (request, response) => {
      setActivity(request, { action: 'payment.list-mine' })
      response.json(await dependencies.payments.listMine((request as StudentRequest).student))
    }),
  )

  router.get(
    '/author/payments',
    authenticateAuthor(dependencies.authorAuth),
    validateQuery(),
    asyncRoute(async (request, response) => {
      setActivity(request, { action: 'payment.list-author' })
      response.json(await dependencies.payments.listForAuthor((request as AuthorRequest).author))
    }),
  )

  router.post(
    '/student/payment-methods/paystack/setup',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateBody(schemas.cardSetup),
    limit(dependencies.rateLimiter, 'paystack-card-setup', 5, 300),
    asyncRoute(async (request, response) => {
      setActivity(request, { action: 'payment-method.setup' })
      response
        .status(201)
        .json(
          await dependencies.payments.initializeCardSetup(
            (request as StudentRequest).student,
            (request.body as { callbackUrl: string }).callbackUrl,
          ),
        )
    }),
  )

  router.delete(
    '/student/payment-methods/:paymentMethodId',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateParams(schemas.paymentMethodParams),
    asyncRoute(async (request, response) => {
      const paymentMethodId = request.params.paymentMethodId as string
      setActivity(request, { action: 'payment-method.remove' })
      await dependencies.payments.removePaymentMethod(
        (request as StudentRequest).student,
        paymentMethodId,
      )
      response.status(200).json(null)
    }),
  )

  router.post(
    '/payments/paystack/verify',
    validateQuery(),
    validateBody(schemas.paystackReference),
    limit(dependencies.rateLimiter, 'paystack-verify', 30, 60),
    asyncRoute(async (request, response) => {
      const reference = (request.body as { reference: string }).reference
      setActivity(request, { action: 'payment.verify', metadata: { reference } })
      response.json(await dependencies.payments.verify(reference))
    }),
  )

  router.post(
    '/payments/paystack/webhook',
    validateQuery(),
    asyncRoute(async (request, response) => {
      const rawBody = (request as RawRequest).rawBody
      if (!rawBody)
        throw new ApplicationError('Webhook body is unavailable', 'INVALID_WEBHOOK', 400)
      setActivity(request, { action: 'payment.webhook' })
      await dependencies.payments.handleWebhook(
        rawBody,
        request.get('x-paystack-signature'),
        request.body as PaystackEvent,
      )
      response.status(200).json({ received: true })
    }),
  )

  return router
}

const limit = (limiter: RateLimiter, scope: string, maximum: number, seconds: number) =>
  asyncRoute(async (request, _response, next) => {
    if (!(await limiter.consume(`${scope}:${request.ip}`, maximum, seconds)))
      throw new ApplicationError('Too many requests; try again later', 'RATE_LIMITED', 429)
    next()
  })

const asyncRoute =
  (handler: AsyncHandler) =>
  (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next)
  }
