import { Schema } from 'mongoose'
import type { AuthorRating } from '../../../../entities/models/AuthorRating'
import { baseSchema, baseSchemaOptions } from './base'

export const AuthorRatingSchema = new Schema<AuthorRating>(
  {
    ...baseSchema,
    authorId: { type: String, required: true, index: true },
    courseId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
  },
  baseSchemaOptions,
)

AuthorRatingSchema.index({ studentId: 1, courseId: 1 }, { unique: true })
