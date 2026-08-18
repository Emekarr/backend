import type { QueryFilter } from 'mongoose'
import type { AuthorInvitationRepository } from '../../../../entities/interfaces/authorInvitationRepository'
import type {
  AuthorInvitation,
  CreateAuthorInvitation,
} from '../../../../entities/models/AuthorInvitation'
import { DefaultRepository } from '../../index'
import { AuthorInvitationSchema } from '../models/AuthorInvitation'

export class AuthorInvitationRepo
  extends DefaultRepository<AuthorInvitation, CreateAuthorInvitation>
  implements AuthorInvitationRepository
{
  constructor() {
    super('AuthorInvitation', AuthorInvitationSchema)
  }

  async findActiveByEmail(email: string, now: Date): Promise<AuthorInvitation | null> {
    const document = await this.model
      .findOne({
        email: email.toLowerCase(),
        acceptedAt: null,
        expiresAt: { $gt: now },
      } as QueryFilter<AuthorInvitation>)
      .lean()
      .exec()
    return document ? this.toEntity(document as unknown as Record<string, unknown>) : null
  }

  async markSent(id: string, sentAt: Date): Promise<void> {
    await this.model.updateOne({ id } as QueryFilter<AuthorInvitation>, {
      $set: { sentAt, deliveryError: null },
    })
  }

  async markDeliveryFailed(id: string, error: string): Promise<void> {
    await this.model.updateOne({ id } as QueryFilter<AuthorInvitation>, {
      $set: { deliveryError: error.slice(0, 500) },
    })
  }

  async claim(tokenHash: string, acceptedAt: Date): Promise<AuthorInvitation | null> {
    const document = await this.model
      .findOneAndUpdate(
        {
          tokenHash,
          acceptedAt: null,
          expiresAt: { $gt: acceptedAt },
        } as QueryFilter<AuthorInvitation>,
        { $set: { acceptedAt } },
        { new: true },
      )
      .select('+tokenHash')
      .lean()
      .exec()
    return document ? this.toEntity(document as unknown as Record<string, unknown>) : null
  }

  async releaseClaim(id: string): Promise<void> {
    await this.model.updateOne({ id } as QueryFilter<AuthorInvitation>, {
      $set: { acceptedAt: null },
    })
  }
}
