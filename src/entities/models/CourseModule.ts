import type { BaseEntity } from './base'

export interface CourseModule extends BaseEntity {
  courseId: string
  title: string
  content: string
  order: number
}

export type CreateCourseModule = Omit<CourseModule, keyof BaseEntity>
