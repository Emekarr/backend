import { Schema } from 'mongoose'
import {
  ASSESSMENT_ATTEMPT_STATUSES,
  type AssessmentAttempt,
} from '../../../../entities/models/AssessmentAttempt'
import { baseSchema, baseSchemaOptions } from './base'

const answerSchema = new Schema(
  {
    questionId: { type: String, required: true },
    selectedOptionIds: { type: [String], default: [] },
    text: { type: String, default: null, maxlength: 50000 },
    awardedPoints: { type: Number, default: null, min: 0 },
    feedback: { type: String, default: null, maxlength: 5000 },
  },
  { _id: false },
)

export const AssessmentAttemptSchema = new Schema<AssessmentAttempt>(
  {
    ...baseSchema,
    assessmentId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    courseId: { type: String, default: null, index: true },
    attemptNumber: { type: Number, required: true, min: 1, max: 100 },
    status: { type: String, enum: ASSESSMENT_ATTEMPT_STATUSES, required: true },
    startedAt: { type: Date, required: true },
    submittedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    score: { type: Number, default: null, min: 0 },
    maxScore: { type: Number, required: true, min: 1 },
    passed: { type: Boolean, default: null },
    answers: { type: [answerSchema], default: [] },
    reviewedAt: { type: Date, default: null },
    reviewedByAuthorId: { type: String, default: null },
  },
  baseSchemaOptions,
)

AssessmentAttemptSchema.index({ assessmentId: 1, studentId: 1, attemptNumber: 1 }, { unique: true })
