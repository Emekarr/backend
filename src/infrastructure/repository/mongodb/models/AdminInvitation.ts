import { Schema } from 'mongoose'
import type { AdminInvitation } from '../../../../entities/models/AdminInvitation'
import { PERMISSIONS } from '../../../../entities/models/Permissions'
import { baseSchema, baseSchemaOptions } from './base'

export const AdminInvitationSchema = new Schema<AdminInvitation>(
  {
    ...baseSchema,
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    invitedByAdminId: { type: String, required: true, index: true },
    permissions: { type: [String], enum: PERMISSIONS, default: [] },
    tokenHash: { type: String, required: true, unique: true, index: true, select: false },
    expiresAt: { type: Date, required: true, index: true },
    sentAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    deliveryError: { type: String, default: null },
  },
  baseSchemaOptions,
)

AdminInvitationSchema.index({ email: 1, createdAt: -1 })
