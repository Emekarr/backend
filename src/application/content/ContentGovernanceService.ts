import { ApplicationError } from '../../entities/errors/applicationError'
import type { AdminRepository } from '../../entities/interfaces/adminRepository'
import type { AssessmentRepository } from '../../entities/interfaces/assessmentRepository'
import type { AuthorRepository } from '../../entities/interfaces/authorRepository'
import type { ContentGovernanceRepository } from '../../entities/interfaces/contentGovernanceRepository'
import type {
  CourseAggregate,
  CourseCatalogRepository,
} from '../../entities/interfaces/courseRepository'
import type { CourseParticipationRepository } from '../../entities/interfaces/courseParticipationRepository'
import type { EmailJobQueue } from '../../entities/interfaces/services'
import type { AdminNotificationService } from '../admin/AdminNotificationService'
import type { Admin } from '../../entities/models/Admin'
import type { Assessment } from '../../entities/models/Assessment'
import type { Author } from '../../entities/models/Author'
import type {
  ContentReview,
  ContentType,
  ContentVersion,
  CriterionReview,
  QuestionBankItem,
  ReviewCriterion,
} from '../../entities/models/ContentGovernance'
import type {
  ContentPublicationStatus,
  ContentReviewStatus,
  Course,
} from '../../entities/models/Course'

type Source =
  | { sourceType: 'course'; sourceId: string; entity: Course; payload: unknown }
  | { sourceType: 'assessment'; sourceId: string; entity: Assessment; payload: unknown }
  | { sourceType: 'question'; sourceId: string; entity: QuestionBankItem; payload: unknown }

export interface QuestionBankInput {
  courseId?: string | null
  prompt: string
  type: 'multiple_choice' | 'free_text'
  options: Array<{ id: string; label: string }>
  correctOptionIds: string[]
  points: number
}

export interface ContentListQuery {
  bucket?: 'all' | 'pending' | 'approved' | 'rejected' | 'published' | 'archived'
  search?: string
  authorId?: string
  contentId?: string
  courseId?: string
  type?: ContentType
  status?:
    | ContentReviewStatus
    | ContentPublicationStatus
    | 'scheduled'
    | 'in_progress'
    | 'completed'
    | 'cancelled'
  sort?: 'newest' | 'oldest' | 'pending_first'
  page?: number
  limit?: number
}

export interface ReviewDecisionInput {
  versionId: string
  decision: 'approved' | 'rejected' | 'needs_revision'
  summary: string
  criteria: CriterionReview[]
  nextReviewAt?: Date | null
}

export class ContentGovernanceService {
  constructor(
    private readonly dependencies: {
      governance: ContentGovernanceRepository
      admins: AdminRepository
      courses: CourseCatalogRepository
      assessments: AssessmentRepository
      authors: AuthorRepository
      participation: CourseParticipationRepository
      emailJobs: EmailJobQueue
      notifications: AdminNotificationService
    },
  ) {}

  async overview() {
    const items = await this.allContent()
    const counts = this.counts(items)
    const assessments = items.filter((item) =>
      ['assignment', 'quiz', 'exam', 'question'].includes(item.type),
    )
    const assessmentCounts = this.counts(assessments)
    const recentTutorActivity = await this.tutors({ limit: 10 })
    return {
      content: counts,
      recentContent: items.slice(0, 10),
      assessments: assessmentCounts,
      assessmentBreakdown: {
        assignment: assessments.filter((item) => item.type === 'assignment').length,
        quiz: assessments.filter((item) => item.type === 'quiz').length,
        exam: assessments.filter((item) => item.type === 'exam').length,
        question: (await this.questionBank()).items.length,
      },
      recentTutorActivity: recentTutorActivity.items,
    }
  }

  async list(query: ContentListQuery = {}) {
    let items = await this.allContent()
    if (query.bucket && query.bucket !== 'all')
      items = items.filter((item) => bucketMatches(item, query.bucket!))
    if (query.authorId) items = items.filter((item) => item.author.id === query.authorId)
    if (query.contentId) items = items.filter((item) => item.id === query.contentId)
    if (query.courseId) items = items.filter((item) => item.courseId === query.courseId)
    if (query.type) items = items.filter((item) => item.type === query.type)
    if (query.status)
      items = items.filter(
        (item) => item.reviewStatus === query.status || item.publicationStatus === query.status,
      )
    const search = query.search?.trim().toLocaleLowerCase()
    if (search)
      items = items.filter((item) =>
        [
          item.title,
          item.courseName,
          item.author.firstName,
          item.author.lastName,
          item.author.email,
        ]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase().includes(search)),
      )
    items.sort((left, right) => {
      if (query.sort === 'pending_first') {
        const pending =
          Number(right.reviewStatus === 'pending_review') -
          Number(left.reviewStatus === 'pending_review')
        if (pending) return pending
      }
      const delta = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      return query.sort === 'oldest' ? -delta : delta
    })
    return paginate(items, query, {
      authors: uniqueBy(
        items.map((item) => item.author),
        (item) => item.id,
      ),
      types: uniqueBy(
        items.map((item) => item.type),
        (item) => item,
      ),
      statuses: uniqueBy(
        items.flatMap((item) => [item.reviewStatus, item.publicationStatus]),
        (item) => item,
      ),
    })
  }

  async detail(contentId: string) {
    const source = await this.source(contentId)
    const [content, versions, reviews, schedules] = await Promise.all([
      this.present(source),
      this.dependencies.governance.listVersions(contentId),
      this.dependencies.governance.listReviews(contentId),
      this.dependencies.governance.listSchedules(),
    ])
    return {
      content,
      versions: await this.presentVersions(versions),
      reviews: await this.presentReviews(reviews),
      currentPayload: source.payload,
      reviewSchedule:
        (
          await this.presentSchedules(
            schedules.filter((schedule) => schedule.contentId === contentId),
          )
        )[0] ?? null,
      capabilities: capabilities(source.entity),
    }
  }

  async listOwned(author: Author, query: ContentListQuery = {}) {
    return this.list({ ...query, authorId: author.id })
  }

  async ownedDetail(author: Author, contentId: string) {
    const source = await this.source(contentId)
    if (authorId(source.entity) !== author.id)
      throw new ApplicationError('Only the content author can access it', 'FORBIDDEN', 403)
    return this.detail(contentId)
  }

  async submit(
    author: Author,
    contentId: string,
    input: { versionId?: string | null; submissionNote?: string | null },
  ) {
    const source = await this.source(contentId)
    if (authorId(source.entity) !== author.id)
      throw new ApplicationError('Only the content author can submit it', 'FORBIDDEN', 403)
    const state = stateOf(source.entity)
    if (!['draft', 'needs_revision', 'rejected'].includes(state.reviewStatus))
      throw new ApplicationError(
        'Only draft, rejected, or revision-requested content can be submitted',
        'INVALID_TRANSITION',
        409,
      )
    const versions = await this.dependencies.governance.listVersions(contentId)
    let version = input.versionId
      ? await this.dependencies.governance.findVersion(input.versionId)
      : null
    if (input.versionId && (!version || version.contentId !== contentId))
      throw new ApplicationError(
        'The selected draft version is no longer current',
        'VERSION_CONFLICT',
        409,
      )
    if (
      version &&
      version.state !== 'draft' &&
      version.id === state.currentVersionId &&
      (state.reviewStatus === 'needs_revision' || state.reviewStatus === 'rejected')
    )
      version = null
    if (version && version.state !== 'draft')
      throw new ApplicationError(
        'The selected draft version is no longer current',
        'VERSION_CONFLICT',
        409,
      )
    if (version) {
      version = await this.dependencies.governance.updateVersion(version.id, {
        payload: source.payload,
        state: 'submitted',
        changeSummary: input.submissionNote?.trim() || version.changeSummary,
      })
    } else {
      const number = Math.max(0, ...versions.map((item) => item.number)) + 1
      try {
        version = await this.dependencies.governance.createVersion({
          contentId,
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          label: `v${number}.0`,
          number,
          state: 'submitted',
          changeSummary: input.submissionNote?.trim() || null,
          createdById: author.id,
          createdByType: 'author',
          payload: source.payload,
          publishedAt: null,
          publishedById: null,
        })
      } catch (error) {
        if (isDuplicateKeyError(error))
          throw new ApplicationError(
            'The content changed while it was being submitted',
            'VERSION_CONFLICT',
            409,
          )
        throw error
      }
    }
    const now = new Date()
    await this.updateSource(source, {
      reviewStatus: 'pending_review',
      currentVersionId: version!.id,
      submittedAt: now,
      approvedAt: null,
      rejectionReason: null,
    })
    await this.dependencies.notifications
      .publish({
        title: 'Content submitted for review',
        body: `${titleOf(source.entity)} was submitted by ${author.firstName} ${author.lastName}.`,
        link: `/content-assessment/content/${encodeURIComponent(contentId)}`,
      })
      .catch(() => undefined)
    return {
      content: await this.present(await this.source(contentId)),
      version: (await this.presentVersions([version!]))[0],
    }
  }

  async controlledUpdate(
    author: Author,
    contentId: string,
    input: { sourceVersionId?: string; changeSummary: string },
  ) {
    const source = await this.source(contentId)
    if (authorId(source.entity) !== author.id)
      throw new ApplicationError('Only the content author can update it', 'FORBIDDEN', 403)
    const state = stateOf(source.entity)
    if (state.publicationStatus !== 'published')
      throw new ApplicationError(
        'Controlled updates can only start from published content',
        'INVALID_TRANSITION',
        409,
      )
    if (
      input.sourceVersionId &&
      state.publishedVersionId &&
      input.sourceVersionId !== state.publishedVersionId
    )
      throw new ApplicationError(
        'The published version changed before the update was created',
        'VERSION_CONFLICT',
        409,
      )
    let versions = await this.dependencies.governance.listVersions(contentId)
    let publishedVersionId = state.publishedVersionId
    let publishedSnapshot = source.payload

    // Content created before governance was introduced is treated as already
    // published. Capture an immutable baseline before opening its first draft.
    if (!publishedVersionId) {
      const baselineNumber = Math.max(0, ...versions.map((item) => item.number)) + 1
      const baseline = await this.dependencies.governance.createVersion({
        contentId,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        label: `v${baselineNumber}.0`,
        number: baselineNumber,
        state: 'published',
        changeSummary: 'Legacy published version captured for controlled updates',
        createdById: author.id,
        createdByType: 'author',
        payload: publishedSnapshot,
        publishedAt: source.entity.publishedAt ?? source.entity.updatedAt,
        publishedById: null,
      })
      publishedVersionId = baseline.id
      versions = [baseline, ...versions]
    } else {
      const publishedVersion = await this.dependencies.governance.findVersion(publishedVersionId)
      if (!publishedVersion)
        throw new ApplicationError(
          'The published version could not be found',
          'VERSION_CONFLICT',
          409,
        )
      publishedSnapshot = publishedVersion.payload
    }

    const number = Math.max(0, ...versions.map((item) => item.number)) + 1
    const version = await this.dependencies.governance.createVersion({
      contentId,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      label: `v${number}.0-draft`,
      number,
      state: 'draft',
      changeSummary: input.changeSummary.trim(),
      createdById: author.id,
      createdByType: 'author',
      payload: source.payload,
      publishedAt: null,
      publishedById: null,
    })
    await this.updateSource(source, {
      reviewStatus: 'draft',
      currentVersionId: version.id,
      publishedVersionId,
      publishedSnapshot,
      rejectionReason: null,
    })
    return {
      content: await this.present(await this.source(contentId)),
      version: (await this.presentVersions([version]))[0],
    }
  }

  async review(admin: Admin, contentId: string, input: ReviewDecisionInput) {
    assertPermission(admin, 'review_content')
    const source = await this.source(contentId)
    const state = stateOf(source.entity)
    if (state.reviewStatus !== 'pending_review' || state.currentVersionId !== input.versionId)
      throw new ApplicationError(
        'Content is not awaiting review at this version',
        'INVALID_TRANSITION',
        409,
      )
    if (
      (input.decision === 'rejected' || input.decision === 'needs_revision') &&
      !input.summary.trim()
    )
      throw new ApplicationError(
        'Review feedback is required for this decision',
        'VALIDATION_ERROR',
        400,
      )
    const version = await this.dependencies.governance.findVersion(input.versionId)
    if (!version || version.contentId !== contentId || version.state !== 'submitted')
      throw new ApplicationError('The submitted version has changed', 'VERSION_CONFLICT', 409)
    let review: ContentReview
    try {
      review = await this.dependencies.governance.createReview({
        contentId,
        versionId: version.id,
        decision: input.decision,
        summary: input.summary.trim(),
        reviewerId: admin.id,
        criteria: input.criteria,
      })
    } catch (error) {
      if (isDuplicateKeyError(error))
        throw new ApplicationError(
          'This version has already been reviewed',
          'VERSION_CONFLICT',
          409,
        )
      throw error
    }
    await this.dependencies.governance.updateVersion(version.id, {
      state: input.decision === 'approved' ? 'approved' : 'superseded',
    })
    const now = new Date()
    await this.updateSource(source, {
      reviewStatus: input.decision,
      approvedAt: input.decision === 'approved' ? now : null,
      rejectionReason: input.decision === 'approved' ? null : input.summary.trim(),
    })
    if (input.nextReviewAt)
      await this.dependencies.governance.upsertSchedule(contentId, {
        reviewAt: input.nextReviewAt,
        reviewerId: admin.id,
        status: 'scheduled',
      })
    const contentAuthor = await this.dependencies.authors.findById(authorId(source.entity))
    if (contentAuthor)
      await this.dependencies.emailJobs
        .enqueue({
          type: 'content-review',
          email: contentAuthor.email,
          contentId,
          contentTitle: titleOf(source.entity),
          decision: input.decision,
          summary: input.summary.trim(),
        })
        .catch(() => undefined)
    return {
      content: await this.present(await this.source(contentId)),
      review: (await this.presentReviews([review]))[0],
    }
  }

  async publish(admin: Admin, contentId: string, versionId: string) {
    assertPermission(admin, 'publish_content')
    const source = await this.source(contentId)
    const state = stateOf(source.entity)
    if (state.reviewStatus !== 'approved' || state.currentVersionId !== versionId)
      throw new ApplicationError(
        'Only the approved current version can be published',
        'INVALID_TRANSITION',
        409,
      )
    const version = await this.dependencies.governance.findVersion(versionId)
    if (!version || version.contentId !== contentId || version.state !== 'approved')
      throw new ApplicationError('The approved version has changed', 'VERSION_CONFLICT', 409)
    if (state.publishedVersionId && state.publishedVersionId !== versionId)
      await this.dependencies.governance.updateVersion(state.publishedVersionId, {
        state: 'superseded',
      })
    const now = new Date()
    const publishedVersion = await this.dependencies.governance.updateVersion(versionId, {
      state: 'published',
      publishedAt: now,
      publishedById: admin.id,
    })
    await this.updateSource(source, {
      publicationStatus: 'published',
      publishedVersionId: versionId,
      publishedAt: now,
      archivedAt: null,
      publishedSnapshot: version.payload,
    })
    if (source.sourceType === 'course')
      await this.dependencies.participation.resetCourseProgress(source.sourceId)
    if (source.sourceType === 'assessment')
      await this.dependencies.participation.resetCourseCompletion(source.entity.courseId)
    return {
      content: await this.present(await this.source(contentId)),
      publishedVersion: publishedVersion
        ? (await this.presentVersions([publishedVersion]))[0]
        : null,
    }
  }

  async archive(admin: Admin, contentId: string, reason?: string | null) {
    assertPermission(admin, 'archive_content')
    const source = await this.source(contentId)
    if (stateOf(source.entity).publicationStatus === 'archived')
      throw new ApplicationError('Content is already archived', 'INVALID_TRANSITION', 409)
    await this.updateSource(source, {
      publicationStatus: 'archived',
      archivedAt: new Date(),
      rejectionReason: reason?.trim() || source.entity.rejectionReason || null,
    })
    return { content: await this.present(await this.source(contentId)) }
  }

  async schedule(admin: Admin, contentId: string, reviewAt: Date, reviewerId?: string) {
    assertPermission(admin, 'manage_content_versions')
    await this.source(contentId)
    if (reviewAt.getTime() <= Date.now())
      throw new ApplicationError('Review date must be in the future', 'VALIDATION_ERROR', 400)
    const schedule = await this.dependencies.governance.upsertSchedule(contentId, {
      reviewAt,
      reviewerId: reviewerId ?? admin.id,
      status: 'scheduled',
    })
    return { schedule: (await this.presentSchedules([schedule]))[0] }
  }

  async reviewDates(query: ContentListQuery & { from?: Date; to?: Date } = {}) {
    const [schedules, content] = await Promise.all([
      this.presentSchedules(await this.dependencies.governance.listSchedules(query.from, query.to)),
      this.allContent(),
    ])
    const contentById = new Map(content.map((item) => [item.id, item]))
    let items = schedules.map((schedule) => ({
      ...schedule,
      content: contentById.get(schedule.contentId) ?? null,
    }))
    if (query.authorId) items = items.filter((item) => item.content?.author.id === query.authorId)
    if (query.status)
      items = items.filter(
        (item) =>
          item.status === query.status ||
          item.content?.reviewStatus === query.status ||
          item.content?.publicationStatus === query.status,
      )
    return { events: items, items }
  }

  async reviewQueue(query: ContentListQuery = {}, criterion?: ReviewCriterion) {
    const result = await this.list(query)
    return {
      ...result,
      criterion: criterion ?? null,
      items: result.items.map((item) => ({
        ...item,
        score: criterion ? (item.reviewScores[criterion] ?? null) : null,
      })),
    }
  }

  async reviewHistory(
    query: ContentListQuery = {},
    criterion?: ReviewCriterion,
    contentId?: string,
  ) {
    const [allReviews, content, versions, admins] = await Promise.all([
      this.dependencies.governance.listReviews(contentId),
      this.allContent(),
      this.dependencies.governance.listVersions(contentId),
      this.dependencies.admins.findMany(),
    ])
    const contentById = new Map(content.map((item) => [item.id, item]))
    const versionById = new Map(versions.map((item) => [item.id, item]))
    const adminById = new Map(admins.map((admin) => [admin.id, publicAdmin(admin)]))
    let items = allReviews
      .filter(
        (review) => !criterion || review.criteria.some((item) => item.criterion === criterion),
      )
      .map((review) => ({
        ...review,
        content: contentById.get(review.contentId) ?? null,
        version: presentVersion(versionById.get(review.versionId) ?? null, null),
        reviewer: adminById.get(review.reviewerId) ?? deletedAdmin(review.reviewerId),
      }))
    if (query.authorId) items = items.filter((item) => item.content?.author.id === query.authorId)
    if (query.status)
      items = items.filter(
        (item) =>
          item.decision === query.status ||
          item.content?.publicationStatus === query.status ||
          item.content?.reviewStatus === query.status,
      )
    const search = query.search?.trim().toLocaleLowerCase()
    if (search)
      items = items.filter((item) =>
        [
          item.content?.title,
          item.content?.author.firstName,
          item.content?.author.lastName,
          item.reviewer.firstName,
          item.reviewer.lastName,
        ]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase().includes(search)),
      )
    return paginate(items, query, { authors: [], types: [], statuses: [] })
  }

  async versions(
    contentId?: string,
    bucket?: 'published' | 'draft' | 'controlled_update',
    query: { page?: number; limit?: number } = {},
  ) {
    let versions = await this.dependencies.governance.listVersions(contentId)
    if (bucket === 'published') versions = versions.filter((item) => item.state === 'published')
    if (bucket === 'draft') versions = versions.filter((item) => item.state === 'draft')
    if (bucket === 'controlled_update')
      versions = versions.filter((item) => item.state !== 'published' && item.number > 1)
    const items = await this.presentVersions(versions)
    if (contentId) return { versions: items, items }
    return { ...paginate(items, query, { authors: [], types: [], statuses: [] }), versions: items }
  }

  async questionBank(query: ContentListQuery = {}) {
    const [questions, courses, versions, reviews, schedules] = await Promise.all([
      this.dependencies.governance.listQuestions(query.authorId),
      this.dependencies.courses.findAll(),
      this.dependencies.governance.listVersions(),
      this.dependencies.governance.listReviews(),
      this.dependencies.governance.listSchedules(),
    ])
    const courseNames = new Map(courses.map((course) => [course.id, course.name]))
    const authors = await this.authorMap(questions.map((question) => question.authorId))
    const presentedVersions = await this.presentVersions(versions)
    const versionById = new Map(presentedVersions.map((version) => [version.id, version]))
    let items = questions.map((question) => ({
      ...question,
      question: question.prompt,
      courseName: question.courseId ? (courseNames.get(question.courseId) ?? null) : null,
      author: authors.get(question.authorId) ?? deletedAuthor(question.authorId),
      status: question.reviewStatus,
      date: question.updatedAt,
      governance: presentSource(
        {
          sourceType: 'question' as const,
          sourceId: question.id,
          entity: question,
          payload: snapshotQuestion(question),
        },
        authors.get(question.authorId),
        reviews,
        question.courseId ? (courseNames.get(question.courseId) ?? null) : null,
        question.currentVersionId ? (versionById.get(question.currentVersionId) ?? null) : null,
        schedules.find((schedule) => schedule.contentId === question.id)?.reviewAt ?? null,
      ),
    }))
    const search = query.search?.trim().toLocaleLowerCase()
    if (search)
      items = items.filter((item) =>
        [item.question, item.courseName, item.author.firstName, item.author.lastName]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase().includes(search)),
      )
    if (query.courseId) items = items.filter((item) => item.courseId === query.courseId)
    if (query.status)
      items = items.filter(
        (item) => item.reviewStatus === query.status || item.publicationStatus === query.status,
      )
    if (query.bucket && query.bucket !== 'all')
      items = items.filter((item) => bucketMatches(item.governance, query.bucket!))
    items.sort((left, right) => {
      const delta = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      return query.sort === 'oldest' ? -delta : delta
    })
    return paginate(items, query, {
      authors: [...authors.values()],
      types: ['question'],
      statuses: uniqueBy(
        items.flatMap((item) => [item.reviewStatus, item.publicationStatus]),
        (item) => item,
      ),
    })
  }

  async createQuestion(author: Author, input: QuestionBankInput) {
    await this.assertQuestionCourse(author, input.courseId)
    const normalized = normalizeQuestion(input)
    return {
      question: await this.dependencies.governance.createQuestion({
        authorId: author.id,
        courseId: input.courseId ?? null,
        ...normalized,
        reviewStatus: 'draft',
        publicationStatus: 'unpublished',
        currentVersionId: null,
        publishedVersionId: null,
        submittedAt: null,
        approvedAt: null,
        publishedAt: null,
        archivedAt: null,
        rejectionReason: null,
      }),
    }
  }

  async updateQuestion(author: Author, questionId: string, input: QuestionBankInput) {
    const question = await this.dependencies.governance.findQuestion(questionId)
    if (!question) throw new ApplicationError('Question not found', 'CONTENT_NOT_FOUND', 404)
    if (question.authorId !== author.id)
      throw new ApplicationError('Only the question author can edit it', 'FORBIDDEN', 403)
    const state = stateOf(question)
    if (state.publicationStatus === 'archived')
      throw new ApplicationError('Archived content cannot be edited', 'INVALID_TRANSITION', 409)
    if (state.reviewStatus === 'pending_review' || state.reviewStatus === 'approved')
      throw new ApplicationError('Content under review cannot be edited', 'INVALID_TRANSITION', 409)
    if (
      state.publicationStatus === 'published' &&
      state.currentVersionId === state.publishedVersionId
    )
      throw new ApplicationError(
        'Create a controlled update before editing published content',
        'PUBLISHED_VERSION_IMMUTABLE',
        409,
      )
    await this.assertQuestionCourse(author, input.courseId)
    const updated = await this.dependencies.governance.updateQuestion(questionId, {
      courseId: input.courseId ?? null,
      ...normalizeQuestion(input),
    })
    return { question: updated }
  }

  async ownedQuestion(author: Author, questionId: string) {
    const source = await this.source(questionId)
    if (source.sourceType !== 'question')
      throw new ApplicationError('Question not found', 'CONTENT_NOT_FOUND', 404)
    if (source.entity.authorId !== author.id)
      throw new ApplicationError('Only the question author can access it', 'FORBIDDEN', 403)
    return this.detail(questionId)
  }

  async tutors(query: { segment?: string; search?: string; page?: number; limit?: number } = {}) {
    const [authors, content] = await Promise.all([
      this.dependencies.authors.findMany(),
      this.allContent(),
    ])
    const rows = await Promise.all(
      authors.map(async (author) => {
        const own = content.filter((item) => item.author.id === author.id)
        const courses = await this.dependencies.courses.findByAuthor(author.id)
        const participants = await Promise.all(
          courses.map((course) => this.dependencies.participation.listParticipants(course.id)),
        )
        return {
          author: publicAuthor(author),
          status: author.disabledAt ? 'disabled' : 'active',
          courseCount: courses.length,
          studentCount: new Set(participants.flat().map((item) => item.student.id)).size,
          contentCount: own.length,
          pendingCount: own.filter((item) => item.reviewStatus === 'pending_review').length,
          approvedCount: own.filter((item) => item.reviewStatus === 'approved').length,
          rejectedCount: own.filter((item) => item.reviewStatus === 'rejected').length,
          needsRevisionCount: own.filter((item) => item.reviewStatus === 'needs_revision').length,
          lastActive: author.updatedAt,
        }
      }),
    )
    let filtered = rows
    if (query.segment === 'pending') filtered = rows.filter((item) => item.pendingCount > 0)
    if (query.segment === 'approved') filtered = rows.filter((item) => item.approvedCount > 0)
    if (query.segment === 'rejected') filtered = rows.filter((item) => item.rejectedCount > 0)
    if (query.segment === 'needs_revision')
      filtered = rows.filter((item) => item.needsRevisionCount > 0)
    const search = query.search?.trim().toLocaleLowerCase()
    if (search)
      filtered = filtered.filter((item) =>
        `${item.author.firstName} ${item.author.lastName} ${item.author.email}`
          .toLocaleLowerCase()
          .includes(search),
      )
    return paginate(filtered, query, { authors: [], types: [], statuses: [] })
  }

  async tutor(authorIdValue: string) {
    const author = await this.dependencies.authors.findById(authorIdValue)
    if (!author) throw new ApplicationError('Tutor not found', 'AUTHOR_NOT_FOUND', 404)
    const result = await this.tutors({ limit: 500 })
    const summary = result.items.find((item) => item.author.id === authorIdValue)
    const content = await this.list({ authorId: authorIdValue, limit: 500 })
    const courses = await this.dependencies.courses.findByAuthor(authorIdValue)
    return { author: publicAuthor(author), summary, courses, content: content.items }
  }

  async securityPolicy(admin: Admin) {
    const policy = await this.dependencies.governance.getSecurityPolicy()
    return {
      policy: presentPolicy(policy),
      canManageMfaPolicy:
        admin.isSuperAdmin || admin.permissions.includes('manage_security_settings'),
    }
  }

  async updateSecurityPolicy(admin: Admin) {
    assertPermission(admin, 'manage_security_settings')
    const policy = await this.dependencies.governance.upsertSecurityPolicy(admin.id)
    return { policy: presentPolicy(policy), canManageMfaPolicy: true }
  }

  private async allContent() {
    const [courses, assessments, questions, reviews, versions, schedules] = await Promise.all([
      this.dependencies.courses.findAll(),
      this.dependencies.assessments.findAll(),
      this.dependencies.governance.listQuestions(),
      this.dependencies.governance.listReviews(),
      this.dependencies.governance.listVersions(),
      this.dependencies.governance.listSchedules(),
    ])
    const presentedVersions = await this.presentVersions(versions)
    const versionById = new Map(presentedVersions.map((version) => [version.id, version]))
    const authors = await this.authorMap([
      ...courses.map((course) => course.createdByAuthorId),
      ...assessments.map((assessment) => assessment.authorId),
      ...questions.map((question) => question.authorId),
    ])
    const courseNames = new Map(courses.map((course) => [course.id, course.name]))
    return [
      ...courses.map((course) =>
        presentSource(
          { sourceType: 'course' as const, sourceId: course.id, entity: course, payload: course },
          authors.get(course.createdByAuthorId),
          reviews,
          null,
          course.currentVersionId ? (versionById.get(course.currentVersionId) ?? null) : null,
          schedules.find((schedule) => schedule.contentId === course.id)?.reviewAt ?? null,
        ),
      ),
      ...assessments.map((assessment) =>
        presentSource(
          {
            sourceType: 'assessment' as const,
            sourceId: assessment.id,
            entity: assessment,
            payload: assessment,
          },
          authors.get(assessment.authorId),
          reviews,
          courseNames.get(assessment.courseId) ?? null,
          assessment.currentVersionId
            ? (versionById.get(assessment.currentVersionId) ?? null)
            : null,
          schedules.find((schedule) => schedule.contentId === assessment.id)?.reviewAt ?? null,
        ),
      ),
      ...questions.map((question) =>
        presentSource(
          {
            sourceType: 'question' as const,
            sourceId: question.id,
            entity: question,
            payload: snapshotQuestion(question),
          },
          authors.get(question.authorId),
          reviews,
          question.courseId ? (courseNames.get(question.courseId) ?? null) : null,
          question.currentVersionId ? (versionById.get(question.currentVersionId) ?? null) : null,
          schedules.find((schedule) => schedule.contentId === question.id)?.reviewAt ?? null,
        ),
      ),
    ].sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )
  }

  private async source(contentId: string): Promise<Source> {
    const course = await this.dependencies.courses.findById(contentId)
    if (course)
      return {
        sourceType: 'course',
        sourceId: contentId,
        entity: course.course,
        payload: snapshotCourse(course),
      }
    const assessment = await this.dependencies.assessments.findById(contentId)
    if (assessment)
      return {
        sourceType: 'assessment',
        sourceId: contentId,
        entity: assessment,
        payload: snapshotAssessment(assessment),
      }
    const question = await this.dependencies.governance.findQuestion(contentId)
    if (question)
      return {
        sourceType: 'question',
        sourceId: contentId,
        entity: question,
        payload: snapshotQuestion(question),
      }
    throw new ApplicationError('Content not found', 'CONTENT_NOT_FOUND', 404)
  }

  private async present(source: Source) {
    const [author, reviews, course, versions, schedules] = await Promise.all([
      this.dependencies.authors.findById(authorId(source.entity)),
      this.dependencies.governance.listReviews(source.sourceId),
      source.sourceType !== 'course' && source.entity.courseId
        ? this.dependencies.courses.findById(source.entity.courseId)
        : Promise.resolve(null),
      this.dependencies.governance.listVersions(source.sourceId),
      this.dependencies.governance.listSchedules(),
    ])
    const presentedVersions = await this.presentVersions(versions)
    const state = stateOf(source.entity)
    return presentSource(
      source,
      author,
      reviews,
      course?.course.name ?? null,
      state.currentVersionId
        ? (presentedVersions.find((version) => version.id === state.currentVersionId) ?? null)
        : null,
      schedules.find((schedule) => schedule.contentId === source.sourceId)?.reviewAt ?? null,
    )
  }

  private async updateSource(source: Source, update: Record<string, unknown>) {
    if (source.sourceType === 'course')
      return this.dependencies.courses.updateGovernance(source.sourceId, update)
    if (source.sourceType === 'assessment')
      return this.dependencies.assessments.updateGovernance(source.sourceId, update)
    return this.dependencies.governance.updateQuestion(source.sourceId, update)
  }

  private async assertQuestionCourse(author: Author, courseId?: string | null) {
    if (!courseId) return
    const course = await this.dependencies.courses.findById(courseId)
    if (!course) throw new ApplicationError('Course not found', 'COURSE_NOT_FOUND', 404)
    if (course.course.createdByAuthorId !== author.id)
      throw new ApplicationError('Only your own course can be selected', 'FORBIDDEN', 403)
  }

  private async authorMap(ids: string[]) {
    const unique = [...new Set(ids)]
    const authors = await Promise.all(unique.map((id) => this.dependencies.authors.findById(id)))
    return new Map(
      authors
        .filter((author): author is Author => Boolean(author))
        .map((author) => [author.id, publicAuthor(author)]),
    )
  }

  private async presentVersions(versions: ContentVersion[]) {
    const authorIds = versions
      .filter((version) => version.createdByType === 'author')
      .map((version) => version.createdById)
    const adminIds = versions.flatMap((version) => [
      ...(version.createdByType === 'admin' ? [version.createdById] : []),
      ...(version.publishedById ? [version.publishedById] : []),
    ])
    const [authors, admins] = await Promise.all([
      this.authorMap(authorIds),
      Promise.all([...new Set(adminIds)].map((id) => this.dependencies.admins.findById(id))),
    ])
    const adminMap = new Map(
      admins
        .filter((admin): admin is Admin => Boolean(admin))
        .map((admin) => [admin.id, publicAdmin(admin)]),
    )
    return versions
      .map((version) =>
        presentVersion(
          version,
          version.createdByType === 'author'
            ? (authors.get(version.createdById) ?? deletedAuthor(version.createdById))
            : (adminMap.get(version.createdById) ?? deletedAdmin(version.createdById)),
          version.publishedById
            ? (adminMap.get(version.publishedById) ?? deletedAdmin(version.publishedById))
            : null,
        ),
      )
      .filter((version): version is NonNullable<typeof version> => Boolean(version))
  }

  private async presentReviews(reviews: ContentReview[]) {
    const admins = await Promise.all(
      [...new Set(reviews.map((review) => review.reviewerId))].map((id) =>
        this.dependencies.admins.findById(id),
      ),
    )
    const adminMap = new Map(
      admins
        .filter((admin): admin is Admin => Boolean(admin))
        .map((admin) => [admin.id, publicAdmin(admin)]),
    )
    return reviews.map(({ reviewerId, ...review }) => ({
      ...review,
      reviewer: adminMap.get(reviewerId) ?? deletedAdmin(reviewerId),
    }))
  }

  private async presentSchedules(
    schedules: Awaited<ReturnType<ContentGovernanceRepository['listSchedules']>>,
  ) {
    const admins = await Promise.all(
      [...new Set(schedules.map((schedule) => schedule.reviewerId))].map((id) =>
        this.dependencies.admins.findById(id),
      ),
    )
    const adminMap = new Map(
      admins
        .filter((admin): admin is Admin => Boolean(admin))
        .map((admin) => [admin.id, publicAdmin(admin)]),
    )
    return schedules.map(({ reviewerId, ...schedule }) => ({
      ...schedule,
      reviewer: adminMap.get(reviewerId) ?? deletedAdmin(reviewerId),
    }))
  }

  private counts(items: Array<ReturnType<typeof presentSource>>) {
    return {
      total: items.length,
      pendingReview: items.filter((item) => item.reviewStatus === 'pending_review').length,
      approved: items.filter((item) => item.reviewStatus === 'approved').length,
      rejected: items.filter((item) => item.reviewStatus === 'rejected').length,
      published: items.filter((item) => item.publicationStatus === 'published').length,
      archived: items.filter((item) => item.publicationStatus === 'archived').length,
    }
  }
}

type GovernedEntity = Course | Assessment | QuestionBankItem

const stateOf = (entity: GovernedEntity) => ({
  reviewStatus: entity.reviewStatus ?? ('approved' as const),
  publicationStatus: entity.publicationStatus ?? ('published' as const),
  currentVersionId: entity.currentVersionId ?? null,
  publishedVersionId: entity.publishedVersionId ?? null,
})

const authorId = (entity: GovernedEntity) =>
  'createdByAuthorId' in entity ? entity.createdByAuthorId : entity.authorId

const titleOf = (entity: GovernedEntity) =>
  'name' in entity ? entity.name : 'title' in entity ? entity.title : entity.prompt

const typeOf = (source: Source): ContentType =>
  source.sourceType === 'course'
    ? 'lesson'
    : source.sourceType === 'question'
      ? 'question'
      : (source.entity.kind ?? 'exam')

const presentSource = (
  source: Source,
  author: ReturnType<typeof publicAuthor> | Author | null | undefined,
  reviews: ContentReview[],
  courseName: string | null,
  currentVersion: ReturnType<typeof presentVersion> = null,
  nextReviewAt: Date | null = null,
) => {
  const entity = source.entity
  const state = stateOf(entity)
  const latestReview = reviews.find((review) => review.contentId === source.sourceId)
  return {
    id: source.sourceId,
    sourceType: source.sourceType,
    title: titleOf(entity),
    type: typeOf(source),
    courseId: source.sourceType === 'course' ? source.entity.id : source.entity.courseId,
    courseName: source.sourceType === 'course' ? source.entity.name : courseName,
    author:
      author && 'bio' in author
        ? publicAuthor(author as Author)
        : (author ?? deletedAuthor(authorId(entity))),
    reviewStatus: state.reviewStatus,
    publicationStatus: state.publicationStatus,
    currentVersionId: state.currentVersionId,
    currentVersion,
    publishedVersionId: state.publishedVersionId,
    submittedAt: entity.submittedAt ?? null,
    approvedAt: entity.approvedAt ?? null,
    publishedAt: entity.publishedAt ?? null,
    archivedAt: entity.archivedAt ?? null,
    rejectionReason: entity.rejectionReason ?? null,
    reviewScores: Object.fromEntries(
      (latestReview?.criteria ?? []).map((criterion) => [criterion.criterion, criterion.score]),
    ),
    nextReviewAt,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  }
}

const publicAuthor = (author: Author) => ({
  id: author.id,
  firstName: author.firstName,
  lastName: author.lastName,
  email: author.email,
  bio: author.bio,
  disabledAt: author.disabledAt,
  createdAt: author.createdAt,
  updatedAt: author.updatedAt,
})

const deletedAuthor = (id: string) => ({
  id,
  firstName: 'Deleted',
  lastName: 'tutor',
  email: '',
  bio: '',
  disabledAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
})

const publicAdmin = (admin: Admin) => ({
  id: admin.id,
  firstName: admin.firstName,
  lastName: admin.lastName,
  email: admin.email,
})

const deletedAdmin = (id: string) => ({
  id,
  firstName: 'Deleted',
  lastName: 'admin',
  email: '',
})

const presentVersion = (
  version: ContentVersion | null,
  createdBy: ReturnType<typeof publicAdmin> | ReturnType<typeof publicAuthor> | null,
  publishedBy: ReturnType<typeof publicAdmin> | null = null,
) => {
  if (!version) return null
  const { payload: _payload, createdById, createdByType, publishedById, ...item } = version
  return {
    ...item,
    createdBy:
      createdBy ??
      (createdByType === 'author' ? deletedAuthor(createdById) : deletedAdmin(createdById)),
    publishedBy: publishedById ? (publishedBy ?? deletedAdmin(publishedById)) : null,
  }
}

const bucketMatches = (
  item: ReturnType<typeof presentSource>,
  bucket: NonNullable<ContentListQuery['bucket']>,
) => {
  if (bucket === 'pending') return item.reviewStatus === 'pending_review'
  if (bucket === 'approved') return item.reviewStatus === 'approved'
  if (bucket === 'rejected') return item.reviewStatus === 'rejected'
  if (bucket === 'published') return item.publicationStatus === 'published'
  if (bucket === 'archived') return item.publicationStatus === 'archived'
  return true
}

const capabilities = (entity: GovernedEntity) => {
  const state = stateOf(entity)
  return {
    canEdit:
      state.reviewStatus === 'draft' ||
      state.reviewStatus === 'needs_revision' ||
      state.reviewStatus === 'rejected',
    canSubmit: ['draft', 'needs_revision', 'rejected'].includes(state.reviewStatus),
    canReview: state.reviewStatus === 'pending_review',
    canPublish: state.reviewStatus === 'approved',
    canArchive: state.publicationStatus !== 'archived',
    canCreateControlledUpdate: state.publicationStatus === 'published',
  }
}

const paginate = <T>(
  items: T[],
  query: { page?: number; limit?: number },
  filters: { authors: unknown[]; types: unknown[]; statuses: unknown[] },
) => {
  const page = Math.max(1, query.page ?? 1)
  const limit = Math.min(100, Math.max(1, query.limit ?? 25))
  const total = items.length
  return {
    items: items.slice((page - 1) * limit, page * limit),
    page: { number: page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    filters,
  }
}

const uniqueBy = <T>(items: T[], key: (item: T) => string) => [
  ...new Map(items.map((item) => [key(item), item])).values(),
]

const assertPermission = (admin: Admin, permission: Admin['permissions'][number]) => {
  if (!admin.isSuperAdmin && !admin.permissions.includes(permission))
    throw new ApplicationError('You do not have the required permission', 'FORBIDDEN', 403)
}

const presentPolicy = (_policy: unknown) => ({
  admins: { login: 'required' as const },
  authors: { login: 'required' as const },
  students: { login: 'optional' as const, beforeEnrollment: 'required' as const },
})

const isDuplicateKeyError = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 11000

const snapshotCourse = (aggregate: CourseAggregate) => {
  const { publishedSnapshot: _publishedSnapshot, ...course } = aggregate.course
  return { course, modules: aggregate.modules, attachments: aggregate.attachments }
}

const snapshotAssessment = (assessment: Assessment) => {
  const { publishedSnapshot: _publishedSnapshot, ...snapshot } = assessment
  return snapshot
}

const snapshotQuestion = (question: QuestionBankItem) => {
  const { publishedSnapshot: _publishedSnapshot, ...snapshot } = question
  return snapshot
}

const normalizeQuestion = (input: QuestionBankInput) => {
  const options =
    input.type === 'multiple_choice'
      ? input.options.map((option) => ({ id: option.id, label: option.label.trim() }))
      : []
  const optionIds = new Set(options.map((option) => option.id))
  if (
    input.type === 'multiple_choice' &&
    (input.correctOptionIds.length !== 1 || !optionIds.has(input.correctOptionIds[0]!))
  )
    throw new ApplicationError(
      'Multiple-choice questions must identify exactly one listed correct option',
      'INVALID_CORRECT_ANSWER',
      400,
    )
  if (input.type === 'free_text' && input.correctOptionIds.length)
    throw new ApplicationError(
      'Written-response questions cannot include a selected answer',
      'INVALID_CORRECT_ANSWER',
      400,
    )
  return {
    prompt: input.prompt.trim(),
    type: input.type,
    options,
    correctOptionIds: input.type === 'multiple_choice' ? input.correctOptionIds : [],
    points: input.points,
  }
}
