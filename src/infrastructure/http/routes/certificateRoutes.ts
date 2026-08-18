import { Router, type NextFunction, type Request, type Response } from 'express'
import type { CertificateService } from '../../../application/certificate/CertificateService'
import type { StudentAuthService } from '../../../application/student/StudentAuthService'
import { setActivity } from '../activityAudit'
import { schemas, validateBody, validateParams, validateQuery } from '../../validation/joi'
import { authenticateStudent, authenticatedStudent } from './studentRoutes'

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>

export const createCertificateRouter = (dependencies: {
  studentAuth: StudentAuthService
  certificates: CertificateService
}): Router => {
  const router = Router()

  router.get(
    '/certificates/:certificateNumber',
    validateQuery(),
    validateParams(schemas.certificateNumberParams),
    asyncRoute(async (request, response) => {
      const certificateNumber = request.params.certificateNumber as string
      setActivity(request, {
        action: 'certificate.verify',
        metadata: { certificateNumber },
      })
      response.json(await dependencies.certificates.publicDetails(certificateNumber))
    }),
  )

  router.get(
    '/certificates/:certificateNumber/pdf',
    validateQuery(schemas.certificatePdfQuery),
    validateParams(schemas.certificateNumberParams),
    asyncRoute(async (request, response) => {
      const result = await dependencies.certificates.renderPublic(
        request.params.certificateNumber as string,
      )
      const disposition = request.query.download === '1' ? 'attachment' : 'inline'
      response
        .status(200)
        .set({
          'content-type': 'application/pdf',
          'content-disposition': `${disposition}; filename="${result.fileName}"`,
          'cache-control': 'public, max-age=300',
          'x-content-type-options': 'nosniff',
        })
        .send(result.pdf)
    }),
  )

  router.get(
    '/student/courses/:courseId/certificate',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateParams(schemas.idParams),
    asyncRoute(async (request, response) => {
      response.json(
        await dependencies.certificates.getForCompletedCourse(
          authenticatedStudent(request),
          request.params.courseId as string,
        ),
      )
    }),
  )

  router.post(
    '/student/certificates/:certificateId/email',
    authenticateStudent(dependencies.studentAuth),
    validateQuery(),
    validateParams(schemas.certificateParams),
    validateBody(schemas.certificateEmail),
    asyncRoute(async (request, response) => {
      const certificateId = request.params.certificateId as string
      const email = (request.body as { email: string }).email
      setActivity(request, {
        action: 'certificate.email.request',
        metadata: { certificateId, recipient: email },
      })
      await dependencies.certificates.sendToEmail(
        authenticatedStudent(request),
        certificateId,
        email,
      )
      response.status(202).json({ message: 'Certificate email queued for delivery' })
    }),
  )

  return router
}

const asyncRoute =
  (handler: AsyncHandler) =>
  (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next)
  }
