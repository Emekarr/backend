import type { BaseEntity } from './base'

export const LIVE_SESSION_STATUSES = ['scheduled', 'live', 'ended'] as const
export type LiveSessionStatus = (typeof LIVE_SESSION_STATUSES)[number]

export interface LiveSession extends BaseEntity {
  courseId: string | null
  authorId: string
  channelName: string
  durationMinutes: number
  status: LiveSessionStatus
  scheduledAt: Date | null
  startedAt: Date | null
  endedAt: Date | null
  expiresAt: Date | null
  whiteboardRoomUuid: string | null
  whiteboardActive: boolean
  whiteboardUsedAt: Date | null
  cameraDefaultOff: boolean
}

export const LIVE_ACTOR_TYPES = ['author', 'student'] as const
export type LiveActorType = (typeof LIVE_ACTOR_TYPES)[number]

export interface LiveParticipant extends BaseEntity {
  sessionId: string
  courseId: string | null
  actorType: LiveActorType
  actorId: string
  displayName: string
  rtcUid: number
  joinedAt: Date
  leftAt: Date | null
  lastSeenAt: Date
  microphoneOn: boolean
  cameraOn: boolean
  screenSharing: boolean
  handRaised: boolean
  canPublish: boolean
  kickedAt: Date | null
  bannedAt: Date | null
}

export const LIVE_MESSAGE_KINDS = ['chat', 'reaction', 'system'] as const
export type LiveMessageKind = (typeof LIVE_MESSAGE_KINDS)[number]

export interface LiveMessage extends BaseEntity {
  sessionId: string
  courseId: string | null
  actorType: LiveActorType
  actorId: string
  displayName: string
  kind: LiveMessageKind
  body: string
}

export const LIVE_RECORDING_TYPES = ['web', 'audio'] as const
export type LiveRecordingType = (typeof LIVE_RECORDING_TYPES)[number]
export const LIVE_RECORDING_STATUSES = [
  'starting',
  'recording',
  'stopping',
  'processing',
  'ready',
  'failed',
] as const
export type LiveRecordingStatus = (typeof LIVE_RECORDING_STATUSES)[number]

export interface LiveRecordingFile {
  fileName: string
  trackType?: string
  uid?: string
  mixedAllUser?: boolean
  isPlayable?: boolean
}

export interface LiveRecording extends BaseEntity {
  courseId: string
  sessionId: string
  authorId: string
  sequence: number
  type: LiveRecordingType
  status: LiveRecordingStatus
  resourceId: string
  sid: string | null
  recorderUid: string
  startedAt: Date
  stoppedAt: Date | null
  durationSeconds: number | null
  files: LiveRecordingFile[]
  streamVideoId: string | null
  failureReason: string | null
  viewOnly: true
}
