import type { BaseEntity } from './base'

export interface CourseProgressReset {
  resetAt: Date
  reason: 'course_modules_changed'
  completedModuleIds: string[]
  completedAt: Date | null
}

export interface CourseEnrollment extends BaseEntity {
  courseId: string
  studentId: string
  source: 'free' | 'payment' | 'invitation'
  /** Legacy access-grant key. Invitation enrollments contain the invitation ID. */
  invitationId: string
  paymentReference: string | null
  enrolledAt: Date
  completedAt: Date | null
  /** Bounded audit history retained when an author changes the course modules. */
  progressResetHistory: CourseProgressReset[]
}

export type CreateCourseEnrollment = Omit<CourseEnrollment, keyof BaseEntity>
