import type { AdminNotification, CreateAdminNotification } from '../models/AdminNotification'
import type { Repository } from './database'

export interface AdminNotificationRepository
  extends Repository<AdminNotification, CreateAdminNotification> {
  listForAdmin(adminId: string, cursor: Date | null, limit: number): Promise<AdminNotification[]>
  markRead(adminId: string, notificationId: string, readAt: Date): Promise<AdminNotification | null>
  markAllRead(adminId: string, readAt: Date): Promise<number>
}
