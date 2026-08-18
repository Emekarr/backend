import type { BaseEntity } from './base'

export interface Student extends BaseEntity {
  firstName: string
  lastName: string
  email: string
  bio: string
  linkedInUrl: string | null
  xUrl: string | null
  facebookUrl: string | null
  instagramUrl: string | null
  youtubeUrl: string | null
  websiteUrl: string | null
  password: string
  twoFactorEnabled: boolean
  twoFactorSecretEncrypted: string | null
  pendingTwoFactorSecretEncrypted: string | null
  lastTwoFactorTimeStep: number | null
  tokenVersion: number
  passwordChangedAt: Date | null
  disabledAt: Date | null
  disabledReason: string | null
}

export type CreateStudent = Omit<Student, keyof BaseEntity>
