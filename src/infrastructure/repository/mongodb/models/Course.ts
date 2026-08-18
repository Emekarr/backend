import { Schema } from 'mongoose'
import { COURSE_ACCESS_TYPES, COURSE_TYPES, type Course } from '../../../../entities/models/Course'
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
  },
  baseSchemaOptions,
)
