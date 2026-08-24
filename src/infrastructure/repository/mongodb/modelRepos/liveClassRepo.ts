import mongoose, { type Model } from 'mongoose'
import type { LiveClassRepository } from '../../../../entities/interfaces/liveClassRepository'
import type {
  LiveMessage,
  LiveParticipant,
  LiveRecording,
  LiveSession,
} from '../../../../entities/models/LiveClass'
import {
  LiveMessageSchema,
  LiveParticipantSchema,
  LiveRecordingSchema,
  LiveSessionSchema,
} from '../models/LiveClass'

export class LiveClassRepo implements LiveClassRepository {
  private readonly sessions: Model<LiveSession> =
    (mongoose.models.LiveSession as Model<LiveSession> | undefined) ??
    mongoose.model('LiveSession', LiveSessionSchema)
  private readonly participants: Model<LiveParticipant> =
    (mongoose.models.LiveParticipant as Model<LiveParticipant> | undefined) ??
    mongoose.model('LiveParticipant', LiveParticipantSchema)
  private readonly messages: Model<LiveMessage> =
    (mongoose.models.LiveMessage as Model<LiveMessage> | undefined) ??
    mongoose.model('LiveMessage', LiveMessageSchema)
  private readonly recordings: Model<LiveRecording> =
    (mongoose.models.LiveRecording as Model<LiveRecording> | undefined) ??
    mongoose.model('LiveRecording', LiveRecordingSchema)

  async createSession(input: Parameters<LiveClassRepository['createSession']>[0]) {
    return clean<LiveSession>((await this.sessions.create(input)).toObject())
  }
  async findSession(id: string) {
    const value = await this.sessions.findOne({ id }).lean().exec()
    return value ? clean<LiveSession>(value) : null
  }
  async findLatestSessionForCourse(courseId: string) {
    const value = await this.sessions.findOne({ courseId }).sort({ createdAt: -1 }).lean().exec()
    return value ? clean<LiveSession>(value) : null
  }
  async listSessionsForCourse(courseId: string) {
    return (
      await this.sessions.find({ courseId }).sort({ scheduledAt: -1, createdAt: -1 }).lean().exec()
    ).map(clean<LiveSession>)
  }
  async listSessionsForAuthor(authorId: string) {
    return (
      await this.sessions.find({ authorId }).sort({ scheduledAt: -1, createdAt: -1 }).lean().exec()
    ).map(clean<LiveSession>)
  }
  async updateSession(id: string, patch: Parameters<LiveClassRepository['updateSession']>[1]) {
    return required<LiveSession>(
      await this.sessions.findOneAndUpdate({ id }, patch, { new: true }).lean().exec(),
    )
  }
  async upsertParticipant(input: Parameters<LiveClassRepository['upsertParticipant']>[0]) {
    return required<LiveParticipant>(
      await this.participants
        .findOneAndUpdate(
          { sessionId: input.sessionId, actorType: input.actorType, actorId: input.actorId },
          input,
          { new: true, upsert: true, setDefaultsOnInsert: true },
        )
        .lean()
        .exec(),
    )
  }
  async findParticipant(sessionId: string, participantId: string) {
    const value = await this.participants.findOne({ sessionId, id: participantId }).lean().exec()
    return value ? clean<LiveParticipant>(value) : null
  }
  async findParticipantByActor(
    sessionId: string,
    actorType: LiveParticipant['actorType'],
    actorId: string,
  ) {
    const value = await this.participants.findOne({ sessionId, actorType, actorId }).lean().exec()
    return value ? clean<LiveParticipant>(value) : null
  }
  async listParticipants(sessionId: string) {
    return (await this.participants.find({ sessionId }).sort({ joinedAt: 1 }).lean().exec()).map(
      clean<LiveParticipant>,
    )
  }
  async updateParticipant(
    id: string,
    patch: Parameters<LiveClassRepository['updateParticipant']>[1],
  ) {
    return required<LiveParticipant>(
      await this.participants.findOneAndUpdate({ id }, patch, { new: true }).lean().exec(),
    )
  }
  async updateAllParticipants(
    sessionId: string,
    patch: Parameters<LiveClassRepository['updateAllParticipants']>[1],
  ) {
    await this.participants.updateMany({ sessionId, leftAt: null }, patch).exec()
  }
  async markStaleParticipantsLeft(sessionId: string, lastSeenBefore: Date, leftAt: Date) {
    await this.participants
      .updateMany(
        { sessionId, leftAt: null, lastSeenAt: { $lt: lastSeenBefore } },
        {
          leftAt,
          microphoneOn: false,
          cameraOn: false,
          screenSharing: false,
          handRaised: false,
        },
      )
      .exec()
  }
  async createMessage(input: Parameters<LiveClassRepository['createMessage']>[0]) {
    return clean<LiveMessage>((await this.messages.create(input)).toObject())
  }
  async listMessages(sessionId: string, after?: Date) {
    const query: Record<string, unknown> = { sessionId }
    if (after) query.createdAt = { $gt: after }
    return (await this.messages.find(query).sort({ createdAt: 1 }).limit(250).lean().exec()).map(
      clean<LiveMessage>,
    )
  }
  async createRecording(input: Parameters<LiveClassRepository['createRecording']>[0]) {
    return clean<LiveRecording>((await this.recordings.create(input)).toObject())
  }
  async updateRecording(id: string, patch: Parameters<LiveClassRepository['updateRecording']>[1]) {
    return required<LiveRecording>(
      await this.recordings.findOneAndUpdate({ id }, patch, { new: true }).lean().exec(),
    )
  }
  async findRecording(id: string) {
    const value = await this.recordings.findOne({ id }).lean().exec()
    return value ? clean<LiveRecording>(value) : null
  }
  async listRecordings(courseId: string) {
    return (await this.recordings.find({ courseId }).sort({ startedAt: -1 }).lean().exec()).map(
      clean<LiveRecording>,
    )
  }
  async listRecordingsForSession(sessionId: string) {
    return (await this.recordings.find({ sessionId }).sort({ startedAt: -1 }).lean().exec()).map(
      clean<LiveRecording>,
    )
  }
  async countRecordings(sessionId: string) {
    return this.recordings.countDocuments({ sessionId })
  }
}

const clean = <T>(value: unknown): T => {
  const { _id: _id, __v: _version, ...result } = value as Record<string, unknown>
  return result as T
}
const required = <T>(value: unknown): T => {
  if (!value) throw new Error('Live class record was not found')
  return clean<T>(value)
}
