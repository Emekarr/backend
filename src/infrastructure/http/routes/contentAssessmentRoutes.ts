import { Router, type NextFunction, type Request, type Response } from 'express'
import type {
  ContentGovernanceService,
  ContentListQuery,
  QuestionBankInput,
  ReviewDecisionInput,
} from '../../../application/content/ContentGovernanceService'
import type { AdminAuthService } from '../../../application/auth/AdminAuthService'
import type { AuthorAuthService } from '../../../application/author/AuthorAuthService'
import { ApplicationError } from '../../../entities/errors/applicationError'
import type { Permission } from '../../../entities/models/Permissions'
import type { ReviewCriterion } from '../../../entities/models/ContentGovernance'
import { setActivity } from '../activityAudit'
import { schemas, validateBody, validateParams, validateQuery } from '../../validation/joi'
import { authenticateAdmin, authenticatedAdmin } from './adminRoutes'
import { authenticateAuthor, authenticatedAuthor } from './authorRoutes'

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>

export const createContentAssessmentRouter = (dependencies: {
  adminAuth: AdminAuthService
  authorAuth: AuthorAuthService
  governance: ContentGovernanceService
}): Router => {
  const router = Router()
  const admin = authenticateAdmin(dependencies.adminAuth)
  const author = authenticateAuthor(dependencies.authorAuth)

  router.get(
    '/admin/content-assessment/overview',
    admin,
    requirePermission('view_content_assessment'),
    validateQuery(),
    asyncRoute(async (request, response) => {
      setActivity(request, { action: 'content-assessment.overview' })
      response.json(await dependencies.governance.overview())
    }),
  )

  router.get(
    '/admin/content-assessment/content/export',
    admin,
    requirePermission('view_content_assessment'),
    validateQuery(schemas.contentListQuery),
    asyncRoute(async (request, response) => {
      const result = await dependencies.governance.list({ ...contentQuery(request), limit: 100 })
      const rows = [
        ['Tutor', 'Email', 'Title', 'Type', 'Review Status', 'Publication Status', 'Updated'],
        ...result.items.map((item) => [
          `${item.author.firstName} ${item.author.lastName}`,
          item.author.email,
          item.title,
          item.type,
          item.reviewStatus,
          item.publicationStatus,
          new Date(item.updatedAt).toISOString(),
        ]),
      ]
      response
        .status(200)
        .type('text/csv')
        .attachment('danvic-content.csv')
        .send(rows.map((row) => row.map(csvCell).join(',')).join('\n'))
    }),
  )

  router.get(
    '/admin/content-assessment/content',
    admin,
    requirePermission('view_content_assessment'),
    validateQuery(schemas.contentListQuery),
    asyncRoute(async (request, response) => {
      const result = await dependencies.governance.list(contentQuery(request))
      if (request.query.format === 'csv') {
        sendCsv(response, 'danvic-content.csv', [
          ['Tutor', 'Email', 'Title', 'Type', 'Review Status', 'Publication Status', 'Updated'],
          ...result.items.map((item) => [
            `${item.author.firstName} ${item.author.lastName}`,
            item.author.email,
            item.title,
            item.type,
            item.reviewStatus,
            item.publicationStatus,
            item.updatedAt.toISOString(),
          ]),
        ])
        return
      }
      response.json(result)
    }),
  )

  router.get(
    '/admin/content-assessment/content/:contentId/versions',
    admin,
    requirePermission('view_content_assessment'),
    validateParams(schemas.contentParams),
    validateQuery(),
    asyncRoute(async (request, response) => {
      response.json(await dependencies.governance.versions(request.params.contentId as string))
    }),
  )

  router.get(
    '/admin/content-assessment/content/:contentId',
    admin,
    requirePermission('view_content_assessment'),
    validateParams(schemas.contentParams),
    validateQuery(),
    asyncRoute(async (request, response) => {
      response.json(await dependencies.governance.detail(request.params.contentId as string))
    }),
  )

  router.post(
    '/admin/content-assessment/content/:contentId/reviews',
    admin,
    validateParams(schemas.contentParams),
    validateQuery(),
    validateBody(schemas.governanceReview),
    asyncRoute(async (request, response) => {
      const contentId = request.params.contentId as string
      const body = request.body as GovernanceReviewBody
      setActivity(request, {
        action: 'content-assessment.review',
        metadata: { contentId, decision: body.decision },
      })
      response.json(
        await dependencies.governance.review(
          authenticatedAdmin(request),
          contentId,
          reviewInput(body),
        ),
      )
    }),
  )

  router.post(
    '/admin/content-assessment/content/:contentId/publish',
    admin,
    validateParams(schemas.contentParams),
    validateQuery(),
    validateBody(schemas.governancePublish),
    asyncRoute(async (request, response) => {
      const contentId = request.params.contentId as string
      const { versionId } = request.body as { versionId: string }
      setActivity(request, {
        action: 'content-assessment.publish',
        metadata: { contentId, versionId },
      })
      response.json(
        await dependencies.governance.publish(authenticatedAdmin(request), contentId, versionId),
      )
    }),
  )

  router.post(
    '/admin/content-assessment/content/:contentId/archive',
    admin,
    validateParams(schemas.contentParams),
    validateQuery(),
    validateBody(schemas.governanceArchive),
    asyncRoute(async (request, response) => {
      const contentId = request.params.contentId as string
      setActivity(request, { action: 'content-assessment.archive', metadata: { contentId } })
      response.json(
        await dependencies.governance.archive(
          authenticatedAdmin(request),
          contentId,
          (request.body as { reason?: string | null }).reason,
        ),
      )
    }),
  )

  router.post(
    '/admin/content-assessment/content/:contentId/schedule-review',
    admin,
    validateParams(schemas.contentParams),
    validateQuery(),
    validateBody(schemas.reviewSchedule),
    asyncRoute(async (request, response) => {
      const body = request.body as { reviewAt: string; reviewerId?: string }
      response.json(
        await dependencies.governance.schedule(
          authenticatedAdmin(request),
          request.params.contentId as string,
          new Date(body.reviewAt),
          body.reviewerId,
        ),
      )
    }),
  )

  router.get(
    '/admin/content-assessment/assessments',
    admin,
    requirePermission('view_content_assessment'),
    validateQuery(schemas.contentListQuery),
    asyncRoute(async (request, response) => {
      const query = contentQuery(request)
      const rawKind = request.query.kind as string | undefined
      const kind = (rawKind || undefined) as ContentListQuery['type']
      const result = await dependencies.governance.list({ ...query, type: kind })
      if (request.query.format === 'csv') {
        sendCsv(response, 'danvic-assessments.csv', [
          ['Tutor', 'Title', 'Type', 'Course', 'Review Status', 'Updated'],
          ...result.items.map((item) => [
            `${item.author.firstName} ${item.author.lastName}`,
            item.title,
            item.type,
            item.courseName,
            item.reviewStatus,
            item.updatedAt.toISOString(),
          ]),
        ])
        return
      }
      response.json(result)
    }),
  )

  router.get(
    '/admin/content-assessment/question-bank',
    admin,
    requirePermission('manage_question_bank'),
    validateQuery(schemas.contentListQuery),
    asyncRoute(async (request, response) => {
      const result = await dependencies.governance.questionBank(contentQuery(request))
      if (request.query.format === 'csv') {
        sendCsv(response, 'danvic-question-bank.csv', [
          ['Tutor', 'Question', 'Course', 'Review Status', 'Updated'],
          ...result.items.map((item) => [
            `${item.author.firstName} ${item.author.lastName}`,
            item.question,
            item.courseName,
            item.reviewStatus,
            item.updatedAt.toISOString(),
          ]),
        ])
        return
      }
      response.json(result)
    }),
  )

  router.get(
    '/admin/content-assessment/reviews/history',
    admin,
    requirePermission('view_content_assessment'),
    validateQuery(schemas.contentListQuery),
    asyncRoute(async (request, response) => {
      response.json(
        await dependencies.governance.reviewHistory(
          contentQuery(request),
          request.query.criterion as ReviewCriterion | undefined,
          request.query.contentId as string | undefined,
        ),
      )
    }),
  )

  router.get(
    '/admin/content-assessment/reviews',
    admin,
    requirePermission('view_content_assessment'),
    validateQuery(schemas.contentListQuery),
    asyncRoute(async (request, response) => {
      response.json(
        await dependencies.governance.reviewQueue(
          contentQuery(request),
          request.query.criterion as ReviewCriterion | undefined,
        ),
      )
    }),
  )

  router.get(
    '/admin/content-assessment/versions',
    admin,
    requirePermission('manage_content_versions'),
    validateQuery(schemas.contentListQuery),
    asyncRoute(async (request, response) => {
      const result = await dependencies.governance.versions(
        request.query.contentId as string | undefined,
        request.query.bucket as 'published' | 'draft' | 'controlled_update' | undefined,
        {
          page: integerQuery(request.query.page),
          limit: integerQuery(request.query.limit),
        },
      )
      if (request.query.format === 'csv') {
        sendCsv(response, 'danvic-content-versions.csv', [
          ['Version', 'State', 'Created By', 'Created', 'Published', 'Changes'],
          ...result.items.map((item) => [
            item.label,
            item.state,
            `${item.createdBy.firstName} ${item.createdBy.lastName}`,
            item.createdAt.toISOString(),
            item.publishedAt?.toISOString(),
            item.changeSummary,
          ]),
        ])
        return
      }
      response.json(result)
    }),
  )

  router.get(
    '/admin/content-assessment/review-dates',
    admin,
    requirePermission('manage_content_versions'),
    validateQuery(schemas.contentListQuery),
    asyncRoute(async (request, response) => {
      response.json(
        await dependencies.governance.reviewDates({
          ...contentQuery(request),
          from: dateQuery(request.query.from),
          to: dateQuery(request.query.to),
        }),
      )
    }),
  )

  router.get(
    '/admin/content-assessment/tutors/:authorId',
    admin,
    requirePermission('view_tutor_content_analytics'),
    validateParams(schemas.authorParams),
    validateQuery(),
    asyncRoute(async (request, response) => {
      response.json(await dependencies.governance.tutor(request.params.authorId as string))
    }),
  )

  router.get(
    '/admin/content-assessment/tutors',
    admin,
    requirePermission('view_tutor_content_analytics'),
    validateQuery(schemas.contentListQuery),
    asyncRoute(async (request, response) => {
      const result = await dependencies.governance.tutors({
        segment: request.query.segment as string | undefined,
        search: request.query.search as string | undefined,
        page: integerQuery(request.query.page),
        limit: integerQuery(request.query.limit),
      })
      if (request.query.format === 'csv') {
        sendCsv(response, 'danvic-tutors.csv', [
          [
            'Tutor',
            'Email',
            'Courses',
            'Students',
            'Content',
            'Pending',
            'Approved',
            'Rejected',
            'Needs Revision',
            'Last Active',
          ],
          ...result.items.map((item) => [
            `${item.author.firstName} ${item.author.lastName}`,
            item.author.email,
            item.courseCount,
            item.studentCount,
            item.contentCount,
            item.pendingCount,
            item.approvedCount,
            item.rejectedCount,
            item.needsRevisionCount,
            item.lastActive.toISOString(),
          ]),
        ])
        return
      }
      response.json(result)
    }),
  )

  router.get(
    '/admin/settings/security/mfa',
    admin,
    validateQuery(),
    asyncRoute(async (request, response) => {
      response.json(await dependencies.governance.securityPolicy(authenticatedAdmin(request)))
    }),
  )

  router.put(
    '/admin/settings/security/mfa',
    admin,
    validateQuery(),
    validateBody(schemas.mfaPolicy),
    asyncRoute(async (request, response) => {
      setActivity(request, { action: 'security.mfa-policy.update' })
      response.json(await dependencies.governance.updateSecurityPolicy(authenticatedAdmin(request)))
    }),
  )

  router.get(
    '/author/content-governance/mine',
    author,
    validateQuery(schemas.contentListQuery),
    asyncRoute(async (request, response) => {
      response.json(
        await dependencies.governance.listOwned(
          authenticatedAuthor(request),
          contentQuery(request),
        ),
      )
    }),
  )

  router.get(
    '/author/content-governance/:contentId/versions',
    author,
    validateParams(schemas.contentParams),
    validateQuery(),
    asyncRoute(async (request, response) => {
      await dependencies.governance.ownedDetail(
        authenticatedAuthor(request),
        request.params.contentId as string,
      )
      response.json(await dependencies.governance.versions(request.params.contentId as string))
    }),
  )

  router.get(
    '/author/content-governance/:contentId',
    author,
    validateParams(schemas.contentParams),
    validateQuery(),
    asyncRoute(async (request, response) => {
      response.json(
        await dependencies.governance.ownedDetail(
          authenticatedAuthor(request),
          request.params.contentId as string,
        ),
      )
    }),
  )

  for (const action of ['submit', 'resubmit'] as const) {
    router.post(
      `/author/content-governance/:contentId/${action}`,
      author,
      validateParams(schemas.contentParams),
      validateQuery(),
      validateBody(schemas.contentSubmission),
      asyncRoute(async (request, response) => {
        const contentId = request.params.contentId as string
        setActivity(request, { action: `content-governance.${action}`, metadata: { contentId } })
        response.json(
          await dependencies.governance.submit(
            authenticatedAuthor(request),
            contentId,
            request.body as { versionId?: string | null; submissionNote?: string | null },
          ),
        )
      }),
    )
  }

  router.post(
    '/author/content-governance/:contentId/controlled-update',
    author,
    validateParams(schemas.contentParams),
    validateQuery(),
    validateBody(schemas.controlledUpdate),
    asyncRoute(async (request, response) => {
      const contentId = request.params.contentId as string
      response
        .status(201)
        .json(
          await dependencies.governance.controlledUpdate(
            authenticatedAuthor(request),
            contentId,
            request.body as { sourceVersionId?: string; changeSummary: string },
          ),
        )
    }),
  )

  router.get(
    '/author/question-bank',
    author,
    validateQuery(schemas.contentListQuery),
    asyncRoute(async (request, response) => {
      response.json(
        await dependencies.governance.questionBank({
          ...contentQuery(request),
          authorId: authenticatedAuthor(request).id,
        }),
      )
    }),
  )

  router.post(
    '/author/question-bank',
    author,
    validateQuery(),
    validateBody(schemas.questionBankItem),
    asyncRoute(async (request, response) => {
      setActivity(request, { action: 'question-bank.create' })
      response
        .status(201)
        .json(
          await dependencies.governance.createQuestion(
            authenticatedAuthor(request),
            request.body as QuestionBankInput,
          ),
        )
    }),
  )

  router.get(
    '/author/question-bank/:questionId',
    author,
    validateParams(schemas.questionParams),
    validateQuery(),
    asyncRoute(async (request, response) => {
      response.json(
        await dependencies.governance.ownedQuestion(
          authenticatedAuthor(request),
          request.params.questionId as string,
        ),
      )
    }),
  )

  router.patch(
    '/author/question-bank/:questionId',
    author,
    validateParams(schemas.questionParams),
    validateQuery(),
    validateBody(schemas.questionBankItem),
    asyncRoute(async (request, response) => {
      const questionId = request.params.questionId as string
      setActivity(request, { action: 'question-bank.update', metadata: { questionId } })
      response.json(
        await dependencies.governance.updateQuestion(
          authenticatedAuthor(request),
          questionId,
          request.body as QuestionBankInput,
        ),
      )
    }),
  )

  return router
}

type GovernanceReviewBody = {
  versionId?: string | null
  decision: ReviewDecisionInput['decision']
  summary: string
  criteria: Record<
    | 'technicalAccuracy'
    | 'brandConsistency'
    | 'copyrightIp'
    | 'safetyRegulatory'
    | 'contentQuality',
    { score: number | null; comment: string | null }
  >
  nextReviewAt?: string | null
}

const reviewInput = (body: GovernanceReviewBody): ReviewDecisionInput => ({
  versionId: body.versionId,
  decision: body.decision,
  summary: body.summary,
  criteria: [
    { criterion: 'technical_accuracy', ...body.criteria.technicalAccuracy },
    { criterion: 'brand_consistency', ...body.criteria.brandConsistency },
    { criterion: 'copyright_ip', ...body.criteria.copyrightIp },
    { criterion: 'safety_regulatory', ...body.criteria.safetyRegulatory },
    { criterion: 'content_quality', ...body.criteria.contentQuality },
  ],
  nextReviewAt: body.nextReviewAt ? new Date(body.nextReviewAt) : null,
})

const contentQuery = (request: Request): ContentListQuery => ({
  bucket: request.query.bucket as ContentListQuery['bucket'],
  search: request.query.search as string | undefined,
  authorId: request.query.authorId as string | undefined,
  contentId: request.query.contentId as string | undefined,
  courseId: request.query.courseId as string | undefined,
  type: request.query.type as ContentListQuery['type'],
  attachment: request.query.attachment as ContentListQuery['attachment'],
  status: request.query.status as ContentListQuery['status'],
  sort: request.query.sort as ContentListQuery['sort'],
  page: integerQuery(request.query.page),
  limit: integerQuery(request.query.limit),
})

const integerQuery = (value: unknown): number | undefined =>
  typeof value === 'string' ? Number(value) : undefined

const dateQuery = (value: unknown): Date | undefined =>
  typeof value === 'string' ? new Date(value) : undefined

const requirePermission =
  (permission: Permission) =>
  (request: Request, _response: Response, next: NextFunction): void => {
    const current = authenticatedAdmin(request)
    if (!current.isSuperAdmin && !current.permissions.includes(permission)) {
      next(new ApplicationError('You do not have the required permission', 'FORBIDDEN', 403))
      return
    }
    next()
  }

const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`

const sendCsv = (response: Response, filename: string, rows: unknown[][]): void => {
  response
    .status(200)
    .type('text/csv')
    .attachment(filename)
    .send(rows.map((row) => row.map(csvCell).join(',')).join('\n'))
}

const asyncRoute =
  (handler: AsyncHandler) =>
  (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next)
  }
