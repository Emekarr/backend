import { ApplicationError } from '../../entities/errors/applicationError'
import type { AdminNotificationRepository } from '../../entities/interfaces/adminNotificationRepository'
import type { AdminRepository } from '../../entities/interfaces/adminRepository'
import type { Admin } from '../../entities/models/Admin'

const MAX_LIMIT = 100

export class AdminNotificationService {
  constructor(
    private readonly dependencies: {
      notifications: AdminNotificationRepository
      admins: AdminRepository
    },
  ) {}

  async list(admin: Admin, cursor: string | undefined, limit: number | undefined) {
    const parsedCursor = cursor ? new Date(cursor) : null
    if (parsedCursor && Number.isNaN(parsedCursor.getTime()))
      throw new ApplicationError('Cursor must be an ISO timestamp', 'VALIDATION_ERROR', 400)
    const resolvedLimit = Math.min(Math.max(limit ?? 20, 1), MAX_LIMIT)
    const records = await this.dependencies.notifications.listForAdmin(
      admin.id,
      parsedCursor,
      resolvedLimit + 1,
    )
    const notifications = records.slice(0, resolvedLimit).map(publicNotification)
    const last = notifications.at(-1)
    return {
      notifications,
      ...(records.length > resolvedLimit && last ? { nextCursor: last.createdAt } : {}),
    }
  }

  async markRead(admin: Admin, notificationId: string) {
    const notification = await this.dependencies.notifications.markRead(
      admin.id,
      notificationId,
      new Date(),
    )
    if (!notification)
      throw new ApplicationError('Notification not found', 'NOTIFICATION_NOT_FOUND', 404)
    return publicNotification(notification)
  }

  async markAllRead(admin: Admin) {
    return { updatedCount: await this.dependencies.notifications.markAllRead(admin.id, new Date()) }
  }

  async publish(input: { title: string; body: string; link?: string | null }): Promise<void> {
    const admins = await this.dependencies.admins.findMany()
    await Promise.all(
      admins
        .filter((admin) => !admin.disabledAt)
        .map((admin) =>
          this.dependencies.notifications.create({
            adminId: admin.id,
            title: input.title.slice(0, 180),
            body: input.body.slice(0, 2_000),
            link: input.link ?? null,
            readAt: null,
          }),
        ),
    )
  }
}

const publicNotification = (notification: {
  id: string
  title: string
  body: string
  link: string | null
  readAt: Date | null
  createdAt: Date
}) => ({
  id: notification.id,
  title: notification.title,
  body: notification.body,
  ...(notification.link ? { link: notification.link } : {}),
  readAt: notification.readAt,
  createdAt: notification.createdAt,
})
