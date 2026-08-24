import type {
  LiveActorType,
  LiveMessage,
  LiveMessageKind,
  LiveParticipant,
  LiveRecording,
  LiveRecordingFile,
  LiveRecordingStatus,
  LiveRecordingType,
  LiveSession,
} from '../models/LiveClass'

export interface LiveClassRepository {
  createSession(input: Omit<LiveSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<LiveSession>
  findSession(id: string): Promise<LiveSession | null>
  findLatestSessionForCourse(courseId: string): Promise<LiveSession | null>
  listSessionsForCourse(courseId: string): Promise<LiveSession[]>
  listSessionsForAuthor(authorId: string): Promise<LiveSession[]>
  listRecordingsForSession(sessionId: string): Promise<LiveRecording[]>
  updateSession(
    id: string,
    patch: Partial<
      Pick<
        LiveSession,
        | 'status'
        | 'startedAt'
        | 'endedAt'
        | 'expiresAt'
        | 'whiteboardRoomUuid'
        | 'whiteboardActive'
        | 'whiteboardUsedAt'
      >
    >,
  ): Promise<LiveSession>
  upsertParticipant(
    input: Omit<LiveParticipant, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<LiveParticipant>
  findParticipant(sessionId: string, participantId: string): Promise<LiveParticipant | null>
  findParticipantByActor(
    sessionId: string,
    actorType: LiveActorType,
    actorId: string,
  ): Promise<LiveParticipant | null>
  listParticipants(sessionId: string): Promise<LiveParticipant[]>
  updateParticipant(
    id: string,
    patch: Partial<
      Pick<
        LiveParticipant,
        | 'leftAt'
        | 'lastSeenAt'
        | 'microphoneOn'
        | 'cameraOn'
        | 'screenSharing'
        | 'handRaised'
        | 'canPublish'
        | 'kickedAt'
        | 'bannedAt'
      >
    >,
  ): Promise<LiveParticipant>
  updateAllParticipants(
    sessionId: string,
    patch: Partial<Pick<LiveParticipant, 'microphoneOn' | 'cameraOn'>>,
  ): Promise<void>
  markStaleParticipantsLeft(sessionId: string, lastSeenBefore: Date, leftAt: Date): Promise<void>
  createMessage(input: {
    sessionId: string
    courseId: string | null
    actorType: LiveActorType
    actorId: string
    displayName: string
    kind: LiveMessageKind
    body: string
  }): Promise<LiveMessage>
  listMessages(sessionId: string, after?: Date): Promise<LiveMessage[]>
  createRecording(input: Omit<LiveRecording, 'createdAt' | 'updatedAt'>): Promise<LiveRecording>
  updateRecording(
    id: string,
    patch: Partial<
      Pick<
        LiveRecording,
        | 'status'
        | 'sid'
        | 'stoppedAt'
        | 'durationSeconds'
        | 'files'
        | 'streamVideoId'
        | 'failureReason'
      >
    >,
  ): Promise<LiveRecording>
  findRecording(id: string): Promise<LiveRecording | null>
  listRecordings(courseId: string): Promise<LiveRecording[]>
  countRecordings(sessionId: string): Promise<number>
}

export interface AgoraRecordingResult {
  sid: string
  resourceId: string
  files: LiveRecordingFile[]
}

export interface LiveClassProvider {
  readonly appId: string
  createRtcToken(channelName: string, uid: number, canPublish: boolean, expiresAt?: Date): string
  createWhiteboardRoom(): Promise<string>
  createWhiteboardToken(roomUuid: string, userId: string, writable: boolean): Promise<string>
  acquireRecording(channelName: string, recorderUid: string): Promise<string>
  startRecording(input: {
    resourceId: string
    channelName: string
    recorderUid: string
    type: LiveRecordingType
    courseId: string
    recordingId: string
    recorderPageUrl: string
  }): Promise<AgoraRecordingResult>
  stopRecording(input: {
    resourceId: string
    sid: string
    channelName: string
    recorderUid: string
    type: LiveRecordingType
  }): Promise<AgoraRecordingResult>
  banParticipant(
    channelName: string,
    uid: number,
    privileges: Array<'join_channel' | 'publish_audio' | 'publish_video'>,
    durationMinutes: number,
  ): Promise<void>
  ingestRecording?(sourceUrl: string, name: string): Promise<string>
  playbackUrl?(streamVideoId: string): Promise<string>
}
