import type { QueryFilter } from 'mongoose'
import type { AdminInvitationRepository } from '../../../../entities/interfaces/adminInvitationRepository'
import type {
  AdminInvitation,
  CreateAdminInvitation,
} from '../../../../entities/models/AdminInvitation'
import { DefaultRepository } from '../../index'
import { AdminInvitationSchema } from '../models/AdminInvitation'

export class AdminInvitationRepo
  extends DefaultRepository<AdminInvitation, CreateAdminInvitation>
  implements AdminInvitationRepository
{
  constructor() {
    super('AdminInvitation', AdminInvitationSchema)
  }

  async findActiveByEmail(email: string, now: Date): Promise<AdminInvitation | null> {
    const document = await this.model
      .findOne({
        email: email.toLowerCase(),
        acceptedAt: null,
        expiresAt: { $gt: now },
      } as QueryFilter<AdminInvitation>)
      .lean()
      .exec()

    return document ? this.toEntity(document as unknown as Record<string, unknown>) : null
  }

  async findByTokenHash(tokenHash: string): Promise<AdminInvitation | null> {
    const document = await this.model
      .findOne({ tokenHash } as QueryFilter<AdminInvitation>)
      .select('+tokenHash')
      .lean()
      .exec()

    return document ? this.toEntity(document as unknown as Record<string, unknown>) : null
  }

  async markSent(id: string, sentAt: Date): Promise<void> {
    await this.model.updateOne({ id } as QueryFilter<AdminInvitation>, {
      $set: { sentAt, deliveryError: null },
    })
  }

  async markDeliveryFailed(id: string, error: string): Promise<void> {
    await this.model.updateOne({ id } as QueryFilter<AdminInvitation>, {
      $set: { deliveryError: error.slice(0, 500) },
    })
  }

  async claim(tokenHash: string, acceptedAt: Date): Promise<AdminInvitation | null> {
    const document = await this.model
      .findOneAndUpdate(
        {
          tokenHash,
          acceptedAt: null,
          expiresAt: { $gt: acceptedAt },
        } as QueryFilter<AdminInvitation>,
        { $set: { acceptedAt } },
        { new: true },
      )
      .select('+tokenHash')
      .lean()
      .exec()

    return document ? this.toEntity(document as unknown as Record<string, unknown>) : null
  }

  async releaseClaim(id: string): Promise<void> {
    await this.model.updateOne({ id } as QueryFilter<AdminInvitation>, {
      $set: { acceptedAt: null },
    })
  }
}

export default AdminInvitationRepo
