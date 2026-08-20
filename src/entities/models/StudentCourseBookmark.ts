import type { BaseEntity } from './base'

export interface StudentCourseBookmark extends BaseEntity {
  studentId: string
  courseId: string
  enabled: boolean
  scheduledAt: Date | null
  delivered30At: Date | null
  delivered10At: Date | null
  delivery30Error: string | null
  delivery10Error: string | null
}

export type CreateStudentCourseBookmark = Omit<StudentCourseBookmark, keyof BaseEntity>
