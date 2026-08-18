import type { BaseEntity } from './base'

export const ASSESSMENT_ATTEMPT_STATUSES = ['in_progress', 'pending_review', 'graded'] as const
export type AssessmentAttemptStatus = (typeof ASSESSMENT_ATTEMPT_STATUSES)[number]

export interface AssessmentAnswer {
  questionId: string
  selectedOptionIds: string[]
  text: string | null
  awardedPoints: number | null
  feedback: string | null
}

export interface AssessmentAttempt extends BaseEntity {
  assessmentId: string
  studentId: string
  courseId: string | null
  attemptNumber: number
  status: AssessmentAttemptStatus
  startedAt: Date
  submittedAt: Date | null
  expiresAt: Date
  score: number | null
  maxScore: number
  passed: boolean | null
  answers: AssessmentAnswer[]
  reviewedAt: Date | null
  reviewedByAuthorId: string | null
}

export type CreateAssessmentAttempt = Omit<AssessmentAttempt, keyof BaseEntity>
