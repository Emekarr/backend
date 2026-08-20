import type { BaseEntity } from './base'

export interface AuthorInvitation extends BaseEntity {
  email: string
  invitedByAdminId: string
  tokenHash: string
  expiresAt: Date
  sentAt: Date | null
  acceptedAt: Date | null
  deliveryError: string | null
  resendCount: number
  lastResentAt: Date | null
}

export type CreateAuthorInvitation = Omit<AuthorInvitation, keyof BaseEntity>
