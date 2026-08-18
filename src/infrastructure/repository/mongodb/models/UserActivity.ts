import { Schema } from 'mongoose'
import type { UserActivity } from '../../../../entities/models/UserActivity'
import { baseSchema, baseSchemaOptions } from './base'

export const UserActivitySchema = new Schema<UserActivity>(
  {
    ...baseSchema,
    actorType: {
      type: String,
      enum: ['admin', 'author', 'student', 'anonymous', 'system'],
      required: true,
      index: true,
    },
    actorId: { type: String, default: null, index: true },
    actorEmail: { type: String, default: null, lowercase: true, trim: true },
    action: { type: String, required: true, maxlength: 120, index: true },
    outcome: { type: String, enum: ['success', 'failure'], required: true, index: true },
    method: { type: String, default: null },
    path: { type: String, default: null },
    statusCode: { type: Number, default: null },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null, maxlength: 500 },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  baseSchemaOptions,
)

UserActivitySchema.index({ createdAt: -1, actorId: 1 })
