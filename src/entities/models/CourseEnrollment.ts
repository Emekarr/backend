import type { BaseEntity } from './base'

export interface CourseEnrollment extends BaseEntity {
  courseId: string
  studentId: string
  source: 'free' | 'payment' | 'invitation'
  /** Legacy access-grant key. Invitation enrollments contain the invitation ID. */
  invitationId: string
  paymentReference: string | null
  enrolledAt: Date
  completedAt: Date | null
}

export type CreateCourseEnrollment = Omit<CourseEnrollment, keyof BaseEntity>
