import { BaseEntity } from './base'
import type { Permission } from './Permissions'

export interface Admin extends BaseEntity {
  firstName: string
  lastName: string
  email: string
  password: string
  permissions: Permission[]
  isSuperAdmin: boolean
  twoFactorEnabled: boolean
  twoFactorSecretEncrypted: string | null
  pendingTwoFactorSecretEncrypted: string | null
  lastTwoFactorTimeStep: number | null
  tokenVersion: number
  passwordChangedAt: Date | null
  disabledAt: Date | null
  disabledReason: string | null
}

export type CreateAdmin = Omit<Admin, keyof BaseEntity>
