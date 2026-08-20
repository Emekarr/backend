import { Schema } from 'mongoose'
import {
  LIVE_ACTOR_TYPES,
  LIVE_MESSAGE_KINDS,
  LIVE_RECORDING_STATUSES,
  LIVE_RECORDING_TYPES,
  LIVE_SESSION_STATUSES,
  type LiveMessage,
  type LiveParticipant,
  type LiveRecording,
  type LiveSession,
} from '../../../../entities/models/LiveClass'
import { baseSchema, baseSchemaOptions } from './base'

export const LiveSessionSchema = new Schema<LiveSession>(
  {
    ...baseSchema,
    courseId: { type: String, default: null, index: true },
    authorId: { type: String, required: true, index: true },
    channelName: { type: String, required: true, unique: true },
    durationMinutes: { type: Number, required: true, min: 10, max: 300 },
    status: { type: String, enum: LIVE_SESSION_STATUSES, required: true, index: true },
    scheduledAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    whiteboardRoomUuid: { type: String, default: null },
    whiteboardActive: { type: Boolean, required: true, default: false },
    whiteboardUsedAt: { type: Date, default: null },
    cameraDefaultOff: { type: Boolean, required: true, default: true },
  },
  baseSchemaOptions,
)

export const LiveParticipantSchema = new Schema<LiveParticipant>(
  {
    ...baseSchema,
    sessionId: { type: String, required: true, index: true },
    courseId: { type: String, default: null, index: true },
    actorType: { type: String, enum: LIVE_ACTOR_TYPES, required: true },
    actorId: { type: String, required: true },
    displayName: { type: String, required: true, maxlength: 160 },
    rtcUid: { type: Number, required: true },
    joinedAt: { type: Date, required: true },
    leftAt: { type: Date, default: null },
    lastSeenAt: { type: Date, required: true },
    microphoneOn: { type: Boolean, required: true, default: false },
    cameraOn: { type: Boolean, required: true, default: false },
    screenSharing: { type: Boolean, required: true, default: false },
    handRaised: { type: Boolean, required: true, default: false },
    canPublish: { type: Boolean, required: true, default: false },
    kickedAt: { type: Date, default: null },
    bannedAt: { type: Date, default: null },
  },
  baseSchemaOptions,
)
LiveParticipantSchema.index({ sessionId: 1, actorType: 1, actorId: 1 }, { unique: true })

export const LiveMessageSchema = new Schema<LiveMessage>(
  {
    ...baseSchema,
    sessionId: { type: String, required: true, index: true },
    courseId: { type: String, default: null, index: true },
    actorType: { type: String, enum: LIVE_ACTOR_TYPES, required: true },
    actorId: { type: String, required: true },
    displayName: { type: String, required: true, maxlength: 160 },
    kind: { type: String, enum: LIVE_MESSAGE_KINDS, required: true },
    body: { type: String, required: true, maxlength: 2000 },
  },
  baseSchemaOptions,
)

const recordingFileSchema = new Schema(
  {
    fileName: { type: String, required: true },
    trackType: String,
    uid: String,
    mixedAllUser: Boolean,
    isPlayable: Boolean,
  },
  { _id: false },
)

export const LiveRecordingSchema = new Schema<LiveRecording>(
  {
    ...baseSchema,
    courseId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    authorId: { type: String, required: true, index: true },
    sequence: { type: Number, required: true },
    type: { type: String, enum: LIVE_RECORDING_TYPES, required: true },
    status: { type: String, enum: LIVE_RECORDING_STATUSES, required: true, index: true },
    resourceId: { type: String, required: true },
    sid: { type: String, default: null },
    recorderUid: { type: String, required: true },
    startedAt: { type: Date, required: true },
    stoppedAt: { type: Date, default: null },
    durationSeconds: { type: Number, default: null },
    files: { type: [recordingFileSchema], default: [] },
    streamVideoId: { type: String, default: null },
    failureReason: { type: String, default: null },
    viewOnly: { type: Boolean, required: true, default: true, immutable: true },
  },
  baseSchemaOptions,
)
LiveRecordingSchema.index({ sessionId: 1, sequence: 1 }, { unique: true })
