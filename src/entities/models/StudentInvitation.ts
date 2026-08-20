import type { BaseEntity } from './base'

export type StudentInviterType = 'admin' | 'author'

export interface StudentInvitation extends BaseEntity {
  email: string
  courseId: string | null
  invitedByType: StudentInviterType
  invitedById: string
  tokenHash: string
  expiresAt: Date
  sentAt: Date | null
  acceptedAt: Date | null
  deliveryError: string | null
  resendCount: number
  lastResentAt: Date | null
}

export type CreateStudentInvitation = Omit<StudentInvitation, keyof BaseEntity>
