import type { Permission } from './Permissions'
import type { BaseEntity } from './base'

export interface AdminInvitation extends BaseEntity {
  email: string
  invitedByAdminId: string
  permissions: Permission[]
  tokenHash: string
  expiresAt: Date
  sentAt: Date | null
  acceptedAt: Date | null
  deliveryError: string | null
  resendCount: number
  lastResentAt: Date | null
}

export type CreateAdminInvitation = Omit<AdminInvitation, keyof BaseEntity>
