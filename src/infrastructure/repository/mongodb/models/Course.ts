import { Schema } from 'mongoose'
import {
  CONTENT_PUBLICATION_STATUSES,
  CONTENT_REVIEW_STATUSES,
  COURSE_ACCESS_TYPES,
  COURSE_TYPES,
  type Course,
} from '../../../../entities/models/Course'
import { baseSchema, baseSchemaOptions } from './base'

export const CourseSchema = new Schema<Course>(
  {
    ...baseSchema,
    name: { type: String, required: true, trim: true, maxlength: 160 },
    durationMinutes: { type: Number, required: true, min: 1, max: 100000 },
    type: { type: String, enum: COURSE_TYPES, required: true },
    liveCallDurationMinutes: { type: Number, min: 10, max: 300, default: null },
    certificateOnCompletion: { type: Boolean, required: true, default: false },
    scheduledAt: { type: Date, default: null, index: true },
    accessType: { type: String, enum: COURSE_ACCESS_TYPES, required: true, default: 'free' },
    priceKobo: { type: Number, required: true, min: 0, max: 1_000_000_000, default: 0 },
    createdByAuthorId: { type: String, required: true, index: true },
    reviewStatus: { type: String, enum: CONTENT_REVIEW_STATUSES, default: 'draft', index: true },
    publicationStatus: {
      type: String,
      enum: CONTENT_PUBLICATION_STATUSES,
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
