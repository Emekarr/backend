import type { BaseEntity } from './base'

export const ASSESSMENT_QUESTION_TYPES = ['multiple_choice', 'free_text'] as const
export type AssessmentQuestionType = (typeof ASSESSMENT_QUESTION_TYPES)[number]
export const ASSESSMENT_MEDIA_TYPES = ['image', 'video', 'audio'] as const
export type AssessmentMediaType = (typeof ASSESSMENT_MEDIA_TYPES)[number]

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
}

export type CreateAssessment = Omit<Assessment, keyof BaseEntity>
