import { Schema } from 'mongoose'
import type { AuthorInvitation } from '../../../../entities/models/AuthorInvitation'
import { baseSchema, baseSchemaOptions } from './base'

export const AuthorInvitationSchema = new Schema<AuthorInvitation>(
  {
    ...baseSchema,
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    invitedByAdminId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true, select: false },
    expiresAt: { type: Date, required: true, index: true },
    sentAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    deliveryError: { type: String, default: null },
  },
  baseSchemaOptions,
)

AuthorInvitationSchema.index({ email: 1, createdAt: -1 })
