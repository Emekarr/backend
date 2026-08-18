import { Schema } from 'mongoose'
import type { CourseEnrollment } from '../../../../entities/models/CourseEnrollment'
import { baseSchema, baseSchemaOptions } from './base'

export const CourseEnrollmentSchema = new Schema<CourseEnrollment>(
  {
    ...baseSchema,
    courseId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    source: {
      type: String,
      enum: ['free', 'payment', 'invitation'],
      required: true,
      default: 'invitation',
    },
    invitationId: { type: String, required: true, index: true },
    paymentReference: { type: String, default: null },
    enrolledAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
  },
  baseSchemaOptions,
)

CourseEnrollmentSchema.index({ courseId: 1, studentId: 1 }, { unique: true })
CourseEnrollmentSchema.index({ invitationId: 1 }, { unique: true })
CourseEnrollmentSchema.index(
  { paymentReference: 1 },
  { unique: true, partialFilterExpression: { paymentReference: { $type: 'string' } } },
)
