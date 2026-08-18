import type { BaseEntity } from './base'

export interface AdminNotification extends BaseEntity {
  adminId: string
  title: string
  body: string
  link: string | null
  readAt: Date | null
}

export type CreateAdminNotification = Omit<AdminNotification, keyof BaseEntity>
