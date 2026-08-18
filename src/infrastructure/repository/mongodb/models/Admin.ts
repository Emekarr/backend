import { Schema } from 'mongoose'
import type { Admin } from '../../../../entities/models/Admin'
import { PERMISSIONS } from '../../../../entities/models/Permissions'
import { baseSchema, baseSchemaOptions } from './base'

export const AdminSchema = new Schema<Admin>(
  {
    ...baseSchema,
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    permissions: { type: [String], enum: PERMISSIONS, default: [] },
    isSuperAdmin: { type: Boolean, required: true, default: false, index: true },
    twoFactorEnabled: { type: Boolean, required: true, default: false },
    twoFactorSecretEncrypted: { type: String, default: null, select: false },
    pendingTwoFactorSecretEncrypted: { type: String, default: null, select: false },
    lastTwoFactorTimeStep: { type: Number, default: null, select: false },
    tokenVersion: { type: Number, required: true, default: 0 },
    passwordChangedAt: { type: Date, default: null },
    disabledAt: { type: Date, default: null },
    disabledReason: { type: String, default: null },
  },
  baseSchemaOptions,
)

AdminSchema.index(
  { isSuperAdmin: 1 },
  {
    unique: true,
    partialFilterExpression: { isSuperAdmin: true },
  },
)
