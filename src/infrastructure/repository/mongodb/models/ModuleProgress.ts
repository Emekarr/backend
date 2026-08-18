import { Schema } from 'mongoose'
import type { ModuleProgress } from '../../../../entities/models/ModuleProgress'
import { baseSchema, baseSchemaOptions } from './base'

export const ModuleProgressSchema = new Schema<ModuleProgress>(
  {
    ...baseSchema,
    enrollmentId: { type: String, required: true, index: true },
    courseId: { type: String, required: true, index: true },
    moduleId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    completedAt: { type: Date, required: true },
  },
  baseSchemaOptions,
)

ModuleProgressSchema.index({ enrollmentId: 1, moduleId: 1 }, { unique: true })
