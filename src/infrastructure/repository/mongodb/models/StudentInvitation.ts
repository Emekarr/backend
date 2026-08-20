import { Schema } from 'mongoose'
import type { StudentInvitation } from '../../../../entities/models/StudentInvitation'
import { baseSchema, baseSchemaOptions } from './base'

export const StudentInvitationSchema = new Schema<StudentInvitation>(
  {
    ...baseSchema,
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    courseId: { type: String, default: null, index: true },
    invitedByType: { type: String, enum: ['admin', 'author'], required: true, index: true },
    invitedById: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true, select: false },
    expiresAt: { type: Date, required: true, index: true },
    sentAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    deliveryError: { type: String, default: null, maxlength: 500 },
    resendCount: { type: Number, default: 0, min: 0 },
    lastResentAt: { type: Date, default: null },
  },
  baseSchemaOptions,
)

StudentInvitationSchema.index({ email: 1, courseId: 1, createdAt: -1 })
StudentInvitationSchema.index({ invitedByType: 1, invitedById: 1, createdAt: -1 })
