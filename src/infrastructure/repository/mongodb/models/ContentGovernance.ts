import { Schema } from 'mongoose'
import type {
  ContentReview,
  ContentVersion,
  QuestionBankItem,
  ReviewSchedule,
  SecurityPolicy,
} from '../../../../entities/models/ContentGovernance'
import { REVIEW_CRITERIA } from '../../../../entities/models/ContentGovernance'
import { baseSchema, baseSchemaOptions } from './base'

const criterionSchema = new Schema(
  {
    criterion: { type: String, enum: REVIEW_CRITERIA, required: true },
    score: { type: Number, min: 0, max: 100, default: null },
    comment: { type: String, trim: true, maxlength: 5000, default: null },
  },
  { _id: false },
)

const questionOptionSchema = new Schema(
  {
    id: { type: String, required: true, maxlength: 100 },
    label: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { _id: false },
)

export const QuestionBankItemSchema = new Schema<QuestionBankItem>(
  {
    ...baseSchema,
    authorId: { type: String, required: true, index: true },
    courseId: { type: String, default: null, index: true },
    prompt: { type: String, required: true, trim: true, maxlength: 5000 },
    type: { type: String, enum: ['multiple_choice', 'free_text'], required: true },
    options: { type: [questionOptionSchema], default: [] },
    correctOptionIds: { type: [String], default: [] },
    points: { type: Number, required: true, min: 1, max: 1000 },
    reviewStatus: {
      type: String,
      enum: ['draft', 'pending_review', 'approved', 'rejected', 'needs_revision'],
      default: 'draft',
      index: true,
    },
    publicationStatus: {
      type: String,
      enum: ['unpublished', 'published', 'archived'],
      default: 'unpublished',
      index: true,
    },
    currentVersionId: { type: String, default: null, index: true },
    publishedVersionId: { type: String, default: null, index: true },
    submittedAt: { type: Date, default: null, index: true },
    approvedAt: { type: Date, default: null, index: true },
    publishedAt: { type: Date, default: null, index: true },
    archivedAt: { type: Date, default: null, index: true },
    rejectionReason: { type: String, default: null, maxlength: 5000 },
    publishedSnapshot: { type: Schema.Types.Mixed, default: null, select: false },
  },
  baseSchemaOptions,
)

export const ContentVersionSchema = new Schema<ContentVersion>(
  {
    ...baseSchema,
    contentId: { type: String, required: true, index: true },
    sourceType: { type: String, enum: ['course', 'assessment', 'question'], required: true },
    sourceId: { type: String, required: true, index: true },
    label: { type: String, required: true, trim: true, maxlength: 50 },
    number: { type: Number, required: true, min: 1 },
    state: {
      type: String,
      enum: ['draft', 'submitted', 'approved', 'published', 'superseded'],
      required: true,
      index: true,
    },
    changeSummary: { type: String, trim: true, maxlength: 5000, default: null },
    createdById: { type: String, required: true, index: true },
    createdByType: { type: String, enum: ['author', 'admin'], required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    publishedAt: { type: Date, default: null, index: true },
    publishedById: { type: String, default: null, index: true },
  },
  baseSchemaOptions,
)
ContentVersionSchema.index({ contentId: 1, number: 1 }, { unique: true })

export const ContentReviewSchema = new Schema<ContentReview>(
  {
    ...baseSchema,
    contentId: { type: String, required: true, index: true },
    versionId: { type: String, required: true, index: true },
    decision: {
      type: String,
      enum: ['approved', 'rejected', 'needs_revision'],
      required: true,
      index: true,
    },
    summary: { type: String, trim: true, maxlength: 5000, default: '' },
    reviewerId: { type: String, required: true, index: true },
    criteria: { type: [criterionSchema], required: true },
  },
  baseSchemaOptions,
)
ContentReviewSchema.index({ versionId: 1 }, { unique: true })

export const ReviewScheduleSchema = new Schema<ReviewSchedule>(
  {
    ...baseSchema,
    contentId: { type: String, required: true, unique: true, index: true },
    reviewAt: { type: Date, required: true, index: true },
    reviewerId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['scheduled', 'in_progress', 'completed', 'cancelled'],
      default: 'scheduled',
      index: true,
    },
  },
  baseSchemaOptions,
)

export const SecurityPolicySchema = new Schema<SecurityPolicy>(
  {
    ...baseSchema,
    key: { type: String, enum: ['mfa'], required: true, unique: true },
    adminsLogin: { type: String, enum: ['required'], required: true, default: 'required' },
    authorsLogin: { type: String, enum: ['required'], required: true, default: 'required' },
    studentsLogin: { type: String, enum: ['optional'], required: true, default: 'optional' },
    studentsBeforeEnrollment: {
      type: String,
      enum: ['required'],
      required: true,
      default: 'required',
    },
    updatedByAdminId: { type: String, default: null },
  },
  baseSchemaOptions,
)
