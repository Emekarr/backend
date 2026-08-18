import { Schema } from 'mongoose'
import type { AdminNotification } from '../../../../entities/models/AdminNotification'
import { baseSchema, baseSchemaOptions } from './base'

export const AdminNotificationSchema = new Schema<AdminNotification>(
  {
    ...baseSchema,
    adminId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    body: { type: String, required: true, trim: true, maxlength: 2_000 },
    link: { type: String, default: null, maxlength: 2_000 },
    readAt: { type: Date, default: null, index: true },
  },
  baseSchemaOptions,
)

AdminNotificationSchema.index({ adminId: 1, createdAt: -1 })
