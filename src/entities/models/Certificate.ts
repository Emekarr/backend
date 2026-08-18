import type { BaseEntity } from './base'

export interface Certificate extends BaseEntity {
  certificateNumber: string
  studentId: string
  studentName: string
  courseId: string
  courseName: string
  completedAt: Date
  issuedAt: Date
  revokedAt: Date | null
}

export type CreateCertificate = Omit<Certificate, keyof BaseEntity>
