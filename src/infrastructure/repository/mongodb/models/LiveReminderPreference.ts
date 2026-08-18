import { Schema } from 'mongoose'
import type { LiveReminderPreference } from '../../../../entities/models/LiveReminderPreference'
import { baseSchema, baseSchemaOptions } from './base'

export const LiveReminderPreferenceSchema = new Schema<LiveReminderPreference>(
  {
    ...baseSchema,
    authorId: { type: String, required: true, index: true },
    courseId: { type: String, required: true, index: true },
    enabled: { type: Boolean, required: true, default: false },
    reminderAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    deliveryError: { type: String, default: null, maxlength: 1_000 },
  },
  baseSchemaOptions,
)

LiveReminderPreferenceSchema.index({ authorId: 1, courseId: 1 }, { unique: true })
