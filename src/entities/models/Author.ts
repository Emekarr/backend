import { BaseEntity } from './base'

export interface Author extends BaseEntity {
  firstName: string
  lastName: string
  email: string
  bio: string
  linkedInUrl: string | null
  xUrl: string | null
  instagramUrl: string | null
  facebookUrl: string | null
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

export type CreateAuthor = Omit<Author, keyof BaseEntity>
