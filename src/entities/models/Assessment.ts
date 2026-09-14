import type { BaseEntity } from './base'
import type { ContentPublicationStatus, ContentReviewStatus } from './Course'

export const ASSESSMENT_QUESTION_TYPES = ['multiple_choice', 'free_text'] as const
export type AssessmentQuestionType = (typeof ASSESSMENT_QUESTION_TYPES)[number]
export const ASSESSMENT_MEDIA_TYPES = ['image', 'video', 'audio'] as const
export type AssessmentMediaType = (typeof ASSESSMENT_MEDIA_TYPES)[number]
export const ASSESSMENT_KINDS = ['assignment', 'quiz', 'exam'] as const
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number]

export interface AssessmentOption {
  id: string
  label: string
}

export interface AssessmentQuestionResource {
  id: string
  attachmentPath: string
  fileName: string
}

export interface AssessmentQuestion {
  id: string
  prompt: string
  type: AssessmentQuestionType
  options: AssessmentOption[]
  correctOptionIds: string[]
  mediaType: AssessmentMediaType | null
  mediaUrl: string | null
  resources: AssessmentQuestionResource[]
  points: number
}

export interface Assessment extends BaseEntity {
  title: string
  description: string
  authorId: string
  courseId: string
  durationMinutes: number
  opensAt: Date
  closesAt: Date
  manualReview: boolean
  retrySupported: boolean
  maxAttempts: number
  passingScorePercent: number
  questions: AssessmentQuestion[]
  kind?: AssessmentKind
  reviewStatus?: ContentReviewStatus
  publicationStatus?: ContentPublicationStatus
  currentVersionId?: string | null
  publishedVersionId?: string | null
  submittedAt?: Date | null
  approvedAt?: Date | null
  publishedAt?: Date | null
  archivedAt?: Date | null
  rejectionReason?: string | null
  publishedSnapshot?: unknown
}

export type CreateAssessment = Omit<Assessment, keyof BaseEntity>
