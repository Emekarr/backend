import type { BaseEntity } from './base'

export interface AuthorRating extends BaseEntity {
  authorId: string
  courseId: string
  studentId: string
  rating: number
}

export type CreateAuthorRating = Omit<AuthorRating, keyof BaseEntity>
