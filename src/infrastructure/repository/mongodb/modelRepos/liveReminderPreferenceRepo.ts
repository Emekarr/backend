import mongoose, { type Model } from 'mongoose'
import type { LiveReminderPreferenceRepository } from '../../../../entities/interfaces/liveReminderPreferenceRepository'
import type {
  CreateLiveReminderPreference,
  LiveReminderPreference,
} from '../../../../entities/models/LiveReminderPreference'
import { LiveReminderPreferenceSchema } from '../models/LiveReminderPreference'

export class LiveReminderPreferenceRepo implements LiveReminderPreferenceRepository {
  private readonly preferences: Model<LiveReminderPreference> =
    (mongoose.models.LiveReminderPreference as Model<LiveReminderPreference> | undefined) ??
    mongoose.model('LiveReminderPreference', LiveReminderPreferenceSchema)

  async find(authorId: string, courseId: string): Promise<LiveReminderPreference | null> {
    const document = await this.preferences.findOne({ authorId, courseId }).lean().exec()
    return document ? clean(document) : null
  }

  async listForAuthor(authorId: string): Promise<LiveReminderPreference[]> {
    const documents = await this.preferences
      .find({ authorId })
      .sort({ updatedAt: -1 })
      .lean()
      .exec()
    return documents.map(clean)
  }

  async save(input: CreateLiveReminderPreference): Promise<LiveReminderPreference> {
    const document = await this.preferences
      .findOneAndUpdate(
        { authorId: input.authorId, courseId: input.courseId },
        { $set: input },
        { new: true, upsert: true, runValidators: true },
      )
      .lean()
      .exec()
    return clean(document)
  }

  async markDelivered(authorId: string, courseId: string, deliveredAt: Date): Promise<void> {
    await this.preferences
      .updateOne(
        { authorId, courseId, enabled: true },
        { $set: { deliveredAt, deliveryError: null } },
      )
      .exec()
  }

  async markDeliveryFailed(authorId: string, courseId: string, message: string): Promise<void> {
    await this.preferences
      .updateOne(
        { authorId, courseId, enabled: true },
        { $set: { deliveryError: message.slice(0, 1_000) } },
      )
      .exec()
  }
}

const clean = (value: unknown): LiveReminderPreference => {
  const { _id: _id, __v: _version, ...result } = value as Record<string, unknown>
  return result as unknown as LiveReminderPreference
}
