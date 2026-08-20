import { Schema } from 'mongoose'
import type { StudentCourseBookmark } from '../../../../entities/models/StudentCourseBookmark'
import { baseSchema, baseSchemaOptions } from './base'

export const StudentCourseBookmarkSchema = new Schema<StudentCourseBookmark>(
  {
    ...baseSchema,
    studentId: { type: String, required: true, index: true },
    courseId: { type: String, required: true, index: true },
    enabled: { type: Boolean, required: true, default: false },
    scheduledAt: { type: Date, default: null },
    delivered30At: { type: Date, default: null },
    delivered10At: { type: Date, default: null },
    delivery30Error: { type: String, default: null, maxlength: 1_000 },
    delivery10Error: { type: String, default: null, maxlength: 1_000 },
  },
  baseSchemaOptions,
)

StudentCourseBookmarkSchema.index({ studentId: 1, courseId: 1 }, { unique: true })
