import assert from 'node:assert/strict'
import test from 'node:test'
import { ContentGovernanceService } from '../src/application/content/ContentGovernanceService'
import { publishedCourseAggregate } from '../src/application/course/CourseService'
import type { Admin } from '../src/entities/models/Admin'
import type { Author } from '../src/entities/models/Author'
import type { ContentVersion } from '../src/entities/models/ContentGovernance'
import type { Course } from '../src/entities/models/Course'

const now = new Date('2026-09-11T10:00:00.000Z')
const author: Author = {
  id: '01J00000000000000000000001',
  firstName: 'Tola',
  lastName: 'Tutor',
  email: 'author@example.com',
  bio: '',
  linkedInUrl: null,
  xUrl: null,
  instagramUrl: null,
  facebookUrl: null,
  websiteUrl: null,
  password: 'hash',
  twoFactorEnabled: true,
  twoFactorSecretEncrypted: 'encrypted',
  pendingTwoFactorSecretEncrypted: null,
  lastTwoFactorTimeStep: null,
  tokenVersion: 0,
  passwordChangedAt: now,
  disabledAt: null,
  disabledReason: null,
  createdAt: now,
  updatedAt: now,
}

const admin: Admin = {
  id: '01J00000000000000000000002',
  firstName: 'Ada',
  lastName: 'Admin',
  email: 'admin@example.com',
  password: 'hash',
  permissions: ['review_content', 'publish_content'],
  isSuperAdmin: false,
  twoFactorEnabled: true,
  twoFactorSecretEncrypted: 'encrypted',
  pendingTwoFactorSecretEncrypted: null,
  lastTwoFactorTimeStep: null,
  tokenVersion: 0,
  passwordChangedAt: now,
  disabledAt: null,
  disabledReason: null,
  createdAt: now,
  updatedAt: now,
}

const course = (): Course => ({
  id: '01J00000000000000000000003',
  name: 'Governed course',
  durationMinutes: 60,
  type: 'premade',
  liveCallDurationMinutes: null,
  certificateOnCompletion: false,
  scheduledAt: null,
  accessType: 'free',
  priceKobo: 0,
  createdByAuthorId: author.id,
  reviewStatus: 'draft',
  publicationStatus: 'unpublished',
  currentVersionId: null,
  publishedVersionId: null,
  submittedAt: null,
  approvedAt: null,
  publishedAt: null,
  archivedAt: null,
  rejectionReason: null,
  createdAt: now,
  updatedAt: now,
})

test('content must be reviewed before publication and controlled updates preserve the live snapshot', async () => {
  let current = course()
  let sequence = 0
  const versions: ContentVersion[] = []
  const reviews: Array<Record<string, unknown>> = []

  const governance = {
    async createVersion(input: Omit<ContentVersion, 'id' | 'createdAt' | 'updatedAt'>) {
      const version = {
        ...input,
        id: `01J0000000000000000000010${sequence++}`.slice(0, 26),
        createdAt: now,
        updatedAt: now,
      } satisfies ContentVersion
      versions.push(version)
      return version
    },
    async findVersion(id: string) {
      return versions.find((version) => version.id === id) ?? null
    },
    async listVersions(contentId?: string) {
      return contentId ? versions.filter((version) => version.contentId === contentId) : versions
    },
    async updateVersion(id: string, update: Partial<ContentVersion>) {
      const version = versions.find((item) => item.id === id)
      if (!version) return null
      Object.assign(version, update)
      return version
    },
    async createReview(input: Record<string, unknown>) {
      const review = {
        ...input,
        id: '01J00000000000000000000020',
        createdAt: now,
        updatedAt: now,
      }
      reviews.push(review)
      return review
    },
    async listReviews(contentId?: string) {
      return (
        contentId ? reviews.filter((review) => review.contentId === contentId) : reviews
      ) as never[]
    },
    async listQuestions() {
      return []
    },
    async findQuestion() {
      return null
    },
    async listSchedules() {
      return []
    },
  }

  const service = new ContentGovernanceService({
    governance,
    admins: {
      findById: async (id: string) => (id === admin.id ? admin : null),
      findMany: async () => [admin],
    },
    courses: {
      findById: async (id: string) =>
        id === current.id ? { course: current, modules: [], attachments: [] } : null,
      findAll: async () => [current],
      updateGovernance: async (_id: string, update: Partial<Course>) => {
        current = { ...current, ...update, updatedAt: new Date() }
        return current
      },
    },
    assessments: { findById: async () => null, findAll: async () => [] },
    authors: {
      findById: async (id: string) => (id === author.id ? author : null),
      findMany: async () => [author],
    },
    participation: {
      resetCourseProgress: async () => undefined,
      resetCourseCompletion: async () => undefined,
    },
    emailJobs: { enqueue: async () => undefined },
    notifications: { publish: async () => undefined },
  } as ConstructorParameters<typeof ContentGovernanceService>[0])

  const submitted = await service.submit(author, current.id, { submissionNote: 'Ready' })
  assert.equal(current.reviewStatus, 'pending_review')
  assert.equal(versions[0]?.state, 'submitted')

  const versionId = submitted.version!.id
  await service.review(admin, current.id, {
    versionId,
    decision: 'approved',
    summary: 'Approved',
    criteria: [],
  })
  assert.equal(current.reviewStatus, 'approved')

  await service.publish(admin, current.id, versionId)
  assert.equal(current.publicationStatus, 'published')
  assert.equal(current.publishedVersionId, versionId)
  const liveSnapshot = current.publishedSnapshot

  const draft = await service.controlledUpdate(author, current.id, {
    sourceVersionId: versionId,
    changeSummary: 'Refresh examples',
  })
  assert.equal(current.reviewStatus, 'draft')
  assert.equal(current.publicationStatus, 'published')
  assert.deepEqual(current.publishedSnapshot, liveSnapshot)
  assert.equal(draft.version?.state, 'draft')
  assert.notEqual(draft.version?.id, current.publishedVersionId)

  current = { ...current, name: 'Unpublished replacement title' }
  const learnerView = publishedCourseAggregate({ course: current, modules: [], attachments: [] })
  assert.equal(learnerView.course.name, 'Governed course')
})
