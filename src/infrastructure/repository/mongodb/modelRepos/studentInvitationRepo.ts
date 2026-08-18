import type { QueryFilter } from 'mongoose'
import type { StudentInvitationRepository } from '../../../../entities/interfaces/studentInvitationRepository'
import type {
  CreateStudentInvitation,
  StudentInvitation,
} from '../../../../entities/models/StudentInvitation'
import { DefaultRepository } from '../../index'
import { StudentInvitationSchema } from '../models/StudentInvitation'

export class StudentInvitationRepo
  extends DefaultRepository<StudentInvitation, CreateStudentInvitation>
  implements StudentInvitationRepository
{
  constructor() {
    super('StudentInvitation', StudentInvitationSchema)
  }

  async findActive(
    email: string,
    courseId: string | null,
    now: Date,
  ): Promise<StudentInvitation | null> {
    const document = await this.model
      .findOne({
        email: email.toLowerCase(),
        courseId,
        acceptedAt: null,
        expiresAt: { $gt: now },
      } as QueryFilter<StudentInvitation>)
      .lean()
      .exec()
    return document ? this.toEntity(document as unknown as Record<string, unknown>) : null
  }

  async findAccepted(email: string, courseId: string | null): Promise<StudentInvitation | null> {
    const document = await this.model
      .findOne({
        email: email.toLowerCase(),
        courseId,
        acceptedAt: { $ne: null },
      } as QueryFilter<StudentInvitation>)
      .sort({ acceptedAt: -1 })
      .lean()
      .exec()
    return document ? this.toEntity(document as unknown as Record<string, unknown>) : null
  }

  async findManyForInviter(
    invitedByType: 'admin' | 'author',
    invitedById: string,
  ): Promise<StudentInvitation[]> {
    const documents = await this.model
      .find({ invitedByType, invitedById } as QueryFilter<StudentInvitation>)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean()
      .exec()
    return documents.map((item) => this.toEntity(item as unknown as Record<string, unknown>))
  }

  async markSent(id: string, sentAt: Date): Promise<void> {
    await this.model.updateOne({ id } as QueryFilter<StudentInvitation>, {
      $set: { sentAt, deliveryError: null },
    })
  }

  async markDeliveryFailed(id: string, error: string): Promise<void> {
    await this.model.updateOne({ id } as QueryFilter<StudentInvitation>, {
      $set: { deliveryError: error.slice(0, 500) },
    })
  }

  async claim(tokenHash: string, acceptedAt: Date): Promise<StudentInvitation | null> {
    const document = await this.model
      .findOneAndUpdate(
        {
          tokenHash,
          acceptedAt: null,
          expiresAt: { $gt: acceptedAt },
        } as QueryFilter<StudentInvitation>,
        { $set: { acceptedAt } },
        { new: true },
      )
      .select('+tokenHash')
      .lean()
      .exec()
    return document ? this.toEntity(document as unknown as Record<string, unknown>) : null
  }

  async releaseClaim(id: string): Promise<void> {
    await this.model.updateOne({ id } as QueryFilter<StudentInvitation>, {
      $set: { acceptedAt: null },
    })
  }
}
