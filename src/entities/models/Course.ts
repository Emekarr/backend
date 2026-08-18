import type { BaseEntity } from './base'

export const COURSE_TYPES = ['live', 'premade'] as const
export type CourseType = (typeof COURSE_TYPES)[number]
export const COURSE_ACCESS_TYPES = ['free', 'paid'] as const
export type CourseAccessType = (typeof COURSE_ACCESS_TYPES)[number]

export interface Course extends BaseEntity {
  name: string
  durationMinutes: number
  type: CourseType
  /** Length of each live class for live courses; null for premade courses. */
  liveCallDurationMinutes: number | null
  /** Issue a certificate when a learner completes the course without an assessment. */
  certificateOnCompletion: boolean
  scheduledAt: Date | null
  accessType: CourseAccessType
  priceKobo: number
  createdByAuthorId: string
}

export type CreateCourse = Omit<Course, keyof BaseEntity>
