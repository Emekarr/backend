import type { QueryFilter } from 'mongoose'
import type { AdminNotificationRepository } from '../../../../entities/interfaces/adminNotificationRepository'
import type {
  AdminNotification,
  CreateAdminNotification,
} from '../../../../entities/models/AdminNotification'
import { DefaultRepository } from '../../index'
import { AdminNotificationSchema } from '../models/AdminNotification'

export class AdminNotificationRepo
  extends DefaultRepository<AdminNotification, CreateAdminNotification>
  implements AdminNotificationRepository
{
  constructor() {
    super('AdminNotification', AdminNotificationSchema)
  }

  async listForAdmin(
    adminId: string,
    cursor: Date | null,
    limit: number,
  ): Promise<AdminNotification[]> {
    const filter: QueryFilter<AdminNotification> = {
      adminId,
      ...(cursor ? { createdAt: { $lt: cursor } } : {}),
    }
    const documents = await this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec()
    return documents.map((document) =>
      this.toEntity(document as unknown as Record<string, unknown>),
    )
  }

  async markRead(
    adminId: string,
    notificationId: string,
    readAt: Date,
  ): Promise<AdminNotification | null> {
    const document = await this.model
      .findOneAndUpdate(
        { id: notificationId, adminId, readAt: null },
        { $set: { readAt } },
        { new: true, runValidators: true },
      )
      .lean()
      .exec()
    if (document) return this.toEntity(document as unknown as Record<string, unknown>)
    return this.findOne({ id: notificationId, adminId })
  }

  async markAllRead(adminId: string, readAt: Date): Promise<number> {
    const result = await this.model
      .updateMany({ adminId, readAt: null }, { $set: { readAt } })
      .exec()
    return result.modifiedCount
  }
}
