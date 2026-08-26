import { Schema } from 'mongoose'
import {
  ASSESSMENT_MEDIA_TYPES,
  ASSESSMENT_QUESTION_TYPES,
  type Assessment,
} from '../../../../entities/models/Assessment'
import { baseSchema, baseSchemaOptions } from './base'

const optionSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { _id: false },
)

const resourceSchema = new Schema(
  {
    id: { type: String, required: true },
    attachmentPath: { type: String, required: true, maxlength: 2048 },
    fileName: { type: String, required: true, trim: true, maxlength: 200 },
  },
  { _id: false },
)

const questionSchema = new Schema(
  {
    id: { type: String, required: true },
    prompt: { type: String, required: true, trim: true, maxlength: 5000 },
    type: { type: String, enum: ASSESSMENT_QUESTION_TYPES, required: true },
    options: { type: [optionSchema], default: [] },
    correctOptionIds: { type: [String], default: [] },
    mediaType: { type: String, enum: [...ASSESSMENT_MEDIA_TYPES, null], default: null },
    mediaUrl: { type: String, default: null, maxlength: 2048 },
    resources: { type: [resourceSchema], default: [] },
    points: { type: Number, required: true, min: 1, max: 1000 },
  },
  { _id: false },
)

export const AssessmentSchema = new Schema<Assessment>(
  {
    ...baseSchema,
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    authorId: { type: String, required: true, index: true },
    courseId: { type: String, required: true, index: true },
    durationMinutes: { type: Number, required: true, min: 1, max: 1440 },
    opensAt: { type: Date, required: true, index: true },
    closesAt: { type: Date, required: true, index: true },
    manualReview: { type: Boolean, required: true, default: false },
    retrySupported: { type: Boolean, required: true, default: false },
    maxAttempts: { type: Number, required: true, min: 1, max: 100, default: 1 },
    passingScorePercent: { type: Number, required: true, min: 0, max: 100, default: 0 },
    questions: { type: [questionSchema], required: true },
  },
  baseSchemaOptions,
)

AssessmentSchema.index(
  { courseId: 1 },
  { unique: true, partialFilterExpression: { courseId: { $type: 'string' } } },
)
