import type { BaseEntity } from './base'

export const COURSE_TYPES = ['live', 'premade'] as const
export type CourseType = (typeof COURSE_TYPES)[number]
export const COURSE_ACCESS_TYPES = ['free', 'paid'] as const
export type CourseAccessType = (typeof COURSE_ACCESS_TYPES)[number]

export const CONTENT_REVIEW_STATUSES = [
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'needs_revision',
] as const
export type ContentReviewStatus = (typeof CONTENT_REVIEW_STATUSES)[number]
export const CONTENT_PUBLICATION_STATUSES = ['unpublished', 'published', 'archived'] as const
export type ContentPublicationStatus = (typeof CONTENT_PUBLICATION_STATUSES)[number]

export interface Course extends BaseEntity {
  name: string
  durationMinutes: number
  type: CourseType
  /** Length of each live class for live courses; null for premade courses. */
  liveCallDurationMinutes: number | null
  /** Issue a certificate when a learner completes the course without an assessment. */
  certificateOnCompletion: boolean
  scheduledAt: Date | null
  accessType: CourseAccessType
  priceKobo: number
  createdByAuthorId: string
  /** Governance fields are optional only for legacy records created before review enforcement. */
  reviewStatus?: ContentReviewStatus
  publicationStatus?: ContentPublicationStatus
  currentVersionId?: string | null
  publishedVersionId?: string | null
  submittedAt?: Date | null
  approvedAt?: Date | null
  publishedAt?: Date | null
  archivedAt?: Date | null
  rejectionReason?: string | null
  /** Immutable learner-facing snapshot retained while a controlled update is edited. */
  publishedSnapshot?: unknown
}

export type CreateCourse = Omit<Course, keyof BaseEntity>
