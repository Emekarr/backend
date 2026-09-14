import type { BaseEntity } from './base'
import type { AssessmentOption, AssessmentQuestionType } from './Assessment'
import type { ContentPublicationStatus, ContentReviewStatus } from './Course'

export const CONTENT_TYPES = [
  'lesson',
  'video',
  'document',
  'assignment',
  'quiz',
  'exam',
  'question',
] as const
export type ContentType = (typeof CONTENT_TYPES)[number]

export const REVIEW_CRITERIA = [
  'technical_accuracy',
  'brand_consistency',
  'copyright_ip',
  'safety_regulatory',
  'content_quality',
] as const
export type ReviewCriterion = (typeof REVIEW_CRITERIA)[number]

export interface ContentVersion extends BaseEntity {
  contentId: string
  sourceType: 'course' | 'assessment' | 'question'
  sourceId: string
  label: string
  number: number
  state: 'draft' | 'submitted' | 'approved' | 'published' | 'superseded'
  changeSummary: string | null
  createdById: string
  createdByType: 'author' | 'admin'
  payload: unknown
  publishedAt: Date | null
  publishedById: string | null
}

export interface QuestionBankItem extends BaseEntity {
  authorId: string
  courseId: string | null
  prompt: string
  type: AssessmentQuestionType
  options: AssessmentOption[]
  correctOptionIds: string[]
  points: number
  reviewStatus: ContentReviewStatus
  publicationStatus: ContentPublicationStatus
  currentVersionId: string | null
  publishedVersionId: string | null
  submittedAt: Date | null
  approvedAt: Date | null
  publishedAt: Date | null
  archivedAt: Date | null
  rejectionReason: string | null
  publishedSnapshot?: unknown
}

export interface CriterionReview {
  criterion: ReviewCriterion
  score: number | null
  comment: string | null
}

export interface ContentReview extends BaseEntity {
  contentId: string
  versionId: string
  decision: Extract<ContentReviewStatus, 'approved' | 'rejected' | 'needs_revision'>
  summary: string
  reviewerId: string
  criteria: CriterionReview[]
}

export interface ReviewSchedule extends BaseEntity {
  contentId: string
  reviewAt: Date
  reviewerId: string
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
}

export interface SecurityPolicy extends BaseEntity {
  key: 'mfa'
  adminsLogin: 'required'
  authorsLogin: 'required'
  studentsLogin: 'optional'
  studentsBeforeEnrollment: 'required'
  updatedByAdminId: string | null
}

export interface GovernanceState {
  reviewStatus: ContentReviewStatus
  publicationStatus: ContentPublicationStatus
  currentVersionId: string | null
  publishedVersionId: string | null
  submittedAt: Date | null
  approvedAt: Date | null
  publishedAt: Date | null
  archivedAt: Date | null
  rejectionReason: string | null
}
