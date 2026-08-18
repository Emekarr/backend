import { Schema } from 'mongoose'
import type { Attachment } from '../../../../entities/models/Attachment'
import { baseSchema, baseSchemaOptions } from './base'

export const AttachmentSchema = new Schema<Attachment>(
  {
    ...baseSchema,
    courseId: { type: String, required: true, index: true },
    courseName: { type: String, required: true, trim: true },
    moduleId: { type: String, default: null, index: true },
    attachmentPath: { type: String, required: true, unique: true, trim: true },
    fileName: { type: String, default: null, trim: true, maxlength: 200 },
  },
  baseSchemaOptions,
)
