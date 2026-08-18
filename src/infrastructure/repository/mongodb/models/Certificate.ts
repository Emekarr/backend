import { Schema } from 'mongoose'
import type { Certificate } from '../../../../entities/models/Certificate'
import { baseSchema, baseSchemaOptions } from './base'

export const CertificateSchema = new Schema<Certificate>(
  {
    ...baseSchema,
    certificateNumber: { type: String, required: true, unique: true, index: true },
    studentId: { type: String, required: true, index: true },
    studentName: { type: String, required: true, trim: true, maxlength: 240 },
    courseId: { type: String, required: true, index: true },
    courseName: { type: String, required: true, trim: true, maxlength: 160 },
    completedAt: { type: Date, required: true },
    issuedAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  baseSchemaOptions,
)

CertificateSchema.index({ studentId: 1, courseId: 1 }, { unique: true })
