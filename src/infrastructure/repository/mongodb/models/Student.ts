import { Schema } from 'mongoose'
import type { Student } from '../../../../entities/models/Student'
import { baseSchema, baseSchemaOptions } from './base'

export const StudentSchema = new Schema<Student>(
  {
    ...baseSchema,
    firstName: { type: String, required: true, trim: true, maxlength: 100 },
    lastName: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    bio: { type: String, default: '', trim: true, maxlength: 2000 },
    linkedInUrl: { type: String, default: null, trim: true, maxlength: 500 },
    xUrl: { type: String, default: null, trim: true, maxlength: 500 },
    facebookUrl: { type: String, default: null, trim: true, maxlength: 500 },
    instagramUrl: { type: String, default: null, trim: true, maxlength: 500 },
    youtubeUrl: { type: String, default: null, trim: true, maxlength: 500 },
    websiteUrl: { type: String, default: null, trim: true, maxlength: 500 },
    password: { type: String, required: true, select: false },
    twoFactorEnabled: { type: Boolean, required: true, default: false },
    twoFactorSecretEncrypted: { type: String, default: null, select: false },
    pendingTwoFactorSecretEncrypted: { type: String, default: null, select: false },
    lastTwoFactorTimeStep: { type: Number, default: null, select: false },
    tokenVersion: { type: Number, required: true, default: 0 },
    passwordChangedAt: { type: Date, default: null },
    disabledAt: { type: Date, default: null },
    disabledReason: { type: String, default: null, maxlength: 500 },
  },
  baseSchemaOptions,
)
