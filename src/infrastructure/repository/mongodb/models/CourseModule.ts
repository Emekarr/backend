import { Schema } from 'mongoose'
import type { CourseModule } from '../../../../entities/models/CourseModule'
import { baseSchema, baseSchemaOptions } from './base'

export const CourseModuleSchema = new Schema<CourseModule>(
  {
    ...baseSchema,
    courseId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    // Legacy modules contain plain text. New modules contain serialized, validated Tiptap JSON.
    content: { type: String, required: true, maxlength: 2_000_000 },
    order: { type: Number, required: true, min: 0 },
  },
  baseSchemaOptions,
)

CourseModuleSchema.index({ courseId: 1, order: 1 }, { unique: true })
