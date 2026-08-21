import { createHash } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { ApplicationError } from '../../entities/errors/applicationError'
import type { CourseCatalogRepository } from '../../entities/interfaces/courseRepository'
import type { CourseParticipationRepository } from '../../entities/interfaces/courseParticipationRepository'
import type {
  LiveClassProvider,
  LiveClassRepository,
} from '../../entities/interfaces/liveClassRepository'
import type { ObjectStorage } from '../../entities/interfaces/storage'
import type { Author } from '../../entities/models/Author'
import type {
  LiveActorType,
  LiveMessageKind,
  LiveParticipant,
  LiveRecordingType,
  LiveSession,
} from '../../entities/models/LiveClass'
import type { Student } from '../../entities/models/Student'
import type { EnvironmentConfig } from '../../infrastructure/config/environment'
import { generateID } from '../../infrastructure/identifiers/generators'

type Actor = { type: LiveActorType; id: string; displayName: string }

export class LiveClassService {
  constructor(
    private readonly dependencies: {
      live: LiveClassRepository
      courses: CourseCatalogRepository
      participation: CourseParticipationRepository
      provider: LiveClassProvider
      storage: ObjectStorage
      config: EnvironmentConfig
    },
  ) {}

  async authorSession(author: Author, courseId: string) {
    const course = await this.requireOwnedCourse(author.id, courseId)
    const existing = await this.dependencies.live.findLatestSessionForCourse(courseId)
    if (existing && existing.status !== 'ended') return this.settleExpired(existing)
    return this.createSession(author, {
      courseId,
      scheduledAt: course.course.scheduledAt,
      durationMinutes: course.course.liveCallDurationMinutes ?? 60,
    })
  }

  async createSession(
    author: Author,
    input: { courseId: string | null; scheduledAt?: Date | null; durationMinutes: number },
  ) {
    if (input.courseId) {
      const course = await this.requireOwnedCourse(author.id, input.courseId)
      if (course.course.type !== 'live')
        throw new ApplicationError(
          'Live classes can only be attached to live courses',
          'LIVE_COURSE_REQUIRED',
          400,
        )
    }
    if (
      !Number.isInteger(input.durationMinutes) ||
      input.durationMinutes < 10 ||
      input.durationMinutes > 300 ||
      input.durationMinutes % 10 !== 0
    )
      throw new ApplicationError(
        'Live class duration must be between 10 minutes and 5 hours, in 10-minute intervals',
        'VALIDATION_ERROR',
        400,
      )
    return this.dependencies.live.createSession({
      courseId: input.courseId,
      authorId: author.id,
      channelName: `class-${input.courseId ?? 'standalone'}-${generateID()}`.slice(0, 63),
      durationMinutes: input.durationMinutes,
      status: 'scheduled',
      scheduledAt: input.scheduledAt ?? null,
      startedAt: null,
      endedAt: null,
      expiresAt: null,
      whiteboardRoomUuid: null,
      whiteboardActive: false,
      whiteboardUsedAt: null,
      cameraDefaultOff: true,
    })
  }

  async listAuthorSessions(author: Author) {
    return Promise.all(
      (await this.dependencies.live.listSessionsForAuthor(author.id)).map((session) =>
        this.settleExpired(session),
      ),
    )
  }

  async getAuthorSessionById(author: Author, sessionId: string) {
    return this.settleExpired(await this.requireAuthorSession(author.id, sessionId))
  }

  async getAuthorSession(author: Author, courseId: string) {
    await this.requireOwnedCourse(author.id, courseId)
    const session = await this.dependencies.live.findLatestSessionForCourse(courseId)
    return session ? this.settleExpired(session) : session
  }

  async getStudentSession(student: Student, courseId: string) {
    await this.requireEnrollment(student.id, courseId)
    const session = await this.dependencies.live.findLatestSessionForCourse(courseId)
    return session ? this.settleExpired(session) : session
  }

  async startSession(author: Author, sessionId: string) {
    const session = await this.requireAuthorSession(author.id, sessionId)
    const settled = await this.settleExpired(session)
    if (settled.status === 'ended') throw conflict('This class has already ended')
    if (settled.status === 'live') return settled
    let whiteboardRoomUuid = settled.whiteboardRoomUuid
    if (!whiteboardRoomUuid)
      whiteboardRoomUuid = await this.dependencies.provider.createWhiteboardRoom()
    const startedAt = new Date()
    return this.dependencies.live.updateSession(settled.id, {
      status: 'live',
      startedAt,
      expiresAt: new Date(startedAt.getTime() + settled.durationMinutes * 60 * 1000),
      whiteboardRoomUuid,
    })
  }

  async endSession(author: Author, sessionId: string) {
    const session = await this.requireAuthorSession(author.id, sessionId)
    const active = (await this.dependencies.live.listRecordingsForSession(session.id)).filter(
      (item) => item.status === 'recording',
    )
    for (const recording of active) await this.stopRecording(author, session.id, recording.id)
    return this.dependencies.live.updateSession(session.id, {
      status: 'ended',
      endedAt: new Date(),
      whiteboardActive: false,
    })
  }

  async joinAuthor(author: Author, sessionId: string) {
    const session = await this.settleExpired(await this.requireAuthorSession(author.id, sessionId))
    if (session.status !== 'live') throw conflict('The class is not live')
    return this.join(session, actorFromAuthor(author), true)
  }

  async joinStudent(student: Student, sessionId: string) {
    const session = await this.settleExpired(await this.requireSession(sessionId))
    if (!session.courseId)
      throw new ApplicationError(
        'This live class is not linked to a course',
        'LIVE_CLASS_NOT_LINKED',
        403,
      )
    await this.requireEnrollment(student.id, session.courseId)
    if (session.status !== 'live') throw conflict('The class is not live')
    const current = await this.dependencies.live.findParticipantByActor(
      session.id,
      'student',
      student.id,
    )
    if (current?.bannedAt)
      throw new ApplicationError('You have been banned from this class', 'LIVE_CLASS_BANNED', 403)
    return this.join(session, actorFromStudent(student), current?.canPublish ?? false)
  }

  async leave(actor: Author | Student, actorType: LiveActorType, sessionId: string) {
    const participant = await this.dependencies.live.findParticipantByActor(
      sessionId,
      actorType,
      actor.id,
    )
    if (participant)
      await this.dependencies.live.updateParticipant(participant.id, {
        leftAt: new Date(),
        lastSeenAt: new Date(),
        microphoneOn: false,
        cameraOn: false,
        screenSharing: false,
      })
  }

  async stateForAuthor(author: Author, sessionId: string) {
    const session = await this.settleExpired(await this.requireAuthorSession(author.id, sessionId))
    await this.heartbeat(session.id, 'author', author.id)
    return this.state(session)
  }

  async stateForStudent(student: Student, sessionId: string, after?: Date) {
    const session = await this.settleExpired(await this.requireSession(sessionId))
    if (!session.courseId)
      throw new ApplicationError(
        'This live class is not linked to a course',
        'LIVE_CLASS_NOT_LINKED',
        403,
      )
    await this.requireEnrollment(student.id, session.courseId)
    await this.heartbeat(session.id, 'student', student.id)
    return this.state(session, after)
  }

  async setWhiteboard(author: Author, sessionId: string, active: boolean) {
    const session = await this.settleExpired(await this.requireAuthorSession(author.id, sessionId))
    if (session.status !== 'live') throw conflict('The whiteboard is only available while live')
    if (!session.whiteboardRoomUuid)
      throw new ApplicationError(
        'The whiteboard is not configured for this class',
        'WHITEBOARD_NOT_CONFIGURED',
        422,
      )
    return this.dependencies.live.updateSession(session.id, {
      whiteboardActive: active,
      ...(active && !session.whiteboardUsedAt ? { whiteboardUsedAt: new Date() } : {}),
    })
  }

  async updateSelf(
    actor: Author | Student,
    actorType: LiveActorType,
    sessionId: string,
    patch: {
      microphoneOn?: boolean
      cameraOn?: boolean
      screenSharing?: boolean
      handRaised?: boolean
    },
  ) {
    const participant = await this.requireActorParticipant(sessionId, actorType, actor.id)
    if (
      actorType === 'student' &&
      !participant.canPublish &&
      (patch.microphoneOn || patch.cameraOn || patch.screenSharing)
    )
      throw new ApplicationError(
        'The course author has not enabled participant publishing',
        'PUBLISHING_NOT_ALLOWED',
        403,
      )
    return this.dependencies.live.updateParticipant(participant.id, {
      ...patch,
      lastSeenAt: new Date(),
    })
  }

  async message(
    actor: Author | Student,
    actorType: LiveActorType,
    sessionId: string,
    kind: LiveMessageKind,
    body: string,
  ) {
    const participant = await this.requireActorParticipant(sessionId, actorType, actor.id)
    const value = body.trim()
    if (!value || value.length > 2000)
      throw new ApplicationError(
        'Message must contain 1 to 2000 characters',
        'VALIDATION_ERROR',
        400,
      )
    if (kind === 'reaction' && !['👍', '👏', '❤️', '🎉', '😂', '🤔', '🔥', '🙌'].includes(value))
      throw new ApplicationError('Unsupported reaction', 'VALIDATION_ERROR', 400)
    return this.dependencies.live.createMessage({
      sessionId,
      courseId: participant.courseId,
      actorType,
      actorId: actor.id,
      displayName: participant.displayName,
      kind,
      body: value,
    })
  }

  async moderate(
    author: Author,
    sessionId: string,
    input: {
      action:
        | 'mute-all'
        | 'camera-off-all'
        | 'mute'
        | 'camera-off'
        | 'kick'
        | 'ban'
        | 'allow-publish'
        | 'block-publish'
      participantId?: string
    },
  ) {
    const session = await this.requireAuthorSession(author.id, sessionId)
    if (input.action === 'mute-all') {
      await this.dependencies.live.updateAllParticipants(session.id, { microphoneOn: false })
      return
    }
    if (input.action === 'camera-off-all') {
      await this.dependencies.live.updateAllParticipants(session.id, { cameraOn: false })
      return
    }
    if (!input.participantId)
      throw new ApplicationError('participantId is required', 'VALIDATION_ERROR', 400)
    const participant = await this.dependencies.live.findParticipant(
      session.id,
      input.participantId,
    )
    if (!participant || participant.actorType === 'author')
      throw new ApplicationError('Participant not found', 'PARTICIPANT_NOT_FOUND', 404)
    const now = new Date()
    if (input.action === 'mute')
      await this.dependencies.live.updateParticipant(participant.id, { microphoneOn: false })
    if (input.action === 'camera-off')
      await this.dependencies.live.updateParticipant(participant.id, {
        cameraOn: false,
        screenSharing: false,
      })
    if (input.action === 'allow-publish')
      await this.dependencies.live.updateParticipant(participant.id, { canPublish: true })
    if (input.action === 'block-publish') {
      await this.dependencies.live.updateParticipant(participant.id, {
        canPublish: false,
        microphoneOn: false,
        cameraOn: false,
        screenSharing: false,
      })
    }
    if (input.action === 'kick' || input.action === 'ban') {
      await this.dependencies.live.updateParticipant(participant.id, {
        kickedAt: now,
        bannedAt: input.action === 'ban' ? now : null,
        leftAt: now,
        microphoneOn: false,
        cameraOn: false,
        screenSharing: false,
      })
      await this.dependencies.provider.banParticipant(
        session.channelName,
        participant.rtcUid,
        ['join_channel'],
        input.action === 'ban' ? 1440 : 0,
      )
    }
  }

  async startRecording(author: Author, sessionId: string, type: LiveRecordingType) {
    const session = await this.settleExpired(await this.requireAuthorSession(author.id, sessionId))
    if (session.status !== 'live')
      throw conflict('Recording can only start while the class is live')
    if (type === 'web') requirePublicRecorderUrl(this.dependencies.config.STUDENT_APP_BASE_URL)
    const recordings = await this.dependencies.live.listRecordingsForSession(session.id)
    if (
      recordings.some(
        (item) =>
          item.sessionId === session.id &&
          ['starting', 'recording', 'stopping'].includes(item.status),
      )
    )
      throw conflict('A recording is already active')
    const sequence = (await this.dependencies.live.countRecordings(session.id)) + 1
    const recordingId = generateID()
    const recorderUid = String(900_000_000 + sequence)
    const resourceId = await this.dependencies.provider.acquireRecording(
      session.channelName,
      recorderUid,
    )
    let recording = await this.dependencies.live.createRecording({
      id: recordingId,
      courseId: session.courseId ?? session.id,
      sessionId: session.id,
      authorId: author.id,
      sequence,
      type,
      status: 'starting',
      resourceId,
      sid: null,
      recorderUid,
      startedAt: new Date(),
      stoppedAt: null,
      durationSeconds: null,
      files: [],
      streamVideoId: null,
      failureReason: null,
      viewOnly: true,
    } as Parameters<LiveClassRepository['createRecording']>[0])
    try {
      const recorderToken = jwt.sign(
        { purpose: 'live-recorder', recordingId, sessionId },
        this.dependencies.config.JWT_SECRET,
        { expiresIn: '8h' },
      )
      const recorderPageUrl = `${this.dependencies.config.STUDENT_APP_BASE_URL}/live-recorder/${session.id}?token=${encodeURIComponent(recorderToken)}`
      const started = await this.dependencies.provider.startRecording({
        resourceId,
        channelName: session.channelName,
        recorderUid,
        type,
        courseId: session.courseId ?? session.id,
        recordingId,
        recorderPageUrl,
      })
      recording = await this.dependencies.live.updateRecording(recording.id, {
        status: 'recording',
        sid: started.sid,
        files: started.files,
      })
      return recording
    } catch (error) {
      await this.dependencies.live.updateRecording(recording.id, {
        status: 'failed',
        failureReason: error instanceof Error ? error.message : 'Recording failed to start',
      })
      throw error
    }
  }

  async stopRecording(author: Author, sessionId: string, recordingId: string) {
    const session = await this.requireAuthorSession(author.id, sessionId)
    const recording = await this.dependencies.live.findRecording(recordingId)
    if (!recording || recording.sessionId !== session.id)
      throw new ApplicationError('Recording not found', 'RECORDING_NOT_FOUND', 404)
    if (recording.status !== 'recording' || !recording.sid)
      throw conflict('This recording is not active')
    await this.dependencies.live.updateRecording(recording.id, { status: 'stopping' })
    try {
      const stopped = await this.dependencies.provider.stopRecording({
        resourceId: recording.resourceId,
        sid: recording.sid,
        channelName: session.channelName,
        recorderUid: recording.recorderUid,
        type: recording.type,
      })
      const stoppedAt = new Date()
      let streamVideoId: string | null = null
      const playable = stopped.files.find((file) => file.fileName.endsWith('.mp4'))
      if (playable && this.dependencies.provider.ingestRecording) {
        try {
          const source = await this.dependencies.storage.createSignedView(playable.fileName)
          streamVideoId = await this.dependencies.provider.ingestRecording(
            source.viewUrl,
            `${session.courseId ? `Course ${session.courseId}` : 'Standalone class'} recording ${recording.sequence}`,
          )
        } catch {
          /* Keep the R2 view fallback if Stream ingestion is unavailable. */
        }
      }
      return this.dependencies.live.updateRecording(recording.id, {
        status: 'ready',
        stoppedAt,
        durationSeconds: Math.max(
          1,
          Math.round((stoppedAt.getTime() - recording.startedAt.getTime()) / 1000),
        ),
        files: stopped.files,
        streamVideoId,
      })
    } catch (error) {
      await this.dependencies.live.updateRecording(recording.id, {
        status: 'failed',
        failureReason: error instanceof Error ? error.message : 'Recording failed to stop',
      })
      throw error
    }
  }

  async listRecordingsForAuthor(author: Author, courseId: string) {
    await this.requireOwnedCourse(author.id, courseId)
    return this.dependencies.live.listRecordings(courseId)
  }
  async listRecordingsForStudent(student: Student, courseId: string) {
    await this.requireEnrollment(student.id, courseId)
    return this.dependencies.live.listRecordings(courseId)
  }

  async playback(student: Student, courseId: string, recordingId: string) {
    await this.requireEnrollment(student.id, courseId)
    const recording = await this.requireRecording(recordingId, courseId)
    if (recording.status !== 'ready') throw conflict('This recording is still processing')
    if (recording.streamVideoId && this.dependencies.provider.playbackUrl)
      return {
        playbackUrl: await this.dependencies.provider.playbackUrl(recording.streamVideoId),
        kind: 'iframe' as const,
        expiresInSeconds: 1800,
        viewOnly: true,
      }
    const playable = recording.files.find(
      (file) => file.fileName.endsWith('.mp4') || file.fileName.endsWith('.m3u8'),
    )
    if (!playable)
      throw new ApplicationError(
        'No playable recording file is available',
        'RECORDING_NOT_PLAYABLE',
        409,
      )
    const signed = await this.dependencies.storage.createSignedView(playable.fileName)
    return {
      playbackUrl: signed.viewUrl,
      kind: 'media' as const,
      expiresInSeconds: signed.expiresInSeconds,
      viewOnly: true,
    }
  }

  recorderBootstrap(sessionId: string, token: string) {
    let claims: jwt.JwtPayload
    try {
      claims = jwt.verify(token, this.dependencies.config.JWT_SECRET) as jwt.JwtPayload
    } catch {
      throw new ApplicationError(
        'Recorder access token is invalid or expired',
        'RECORDER_TOKEN_INVALID',
        401,
      )
    }
    if (
      claims.purpose !== 'live-recorder' ||
      claims.sessionId !== sessionId ||
      typeof claims.recordingId !== 'string'
    )
      throw new ApplicationError('Recorder access token is invalid', 'RECORDER_TOKEN_INVALID', 401)
    return this.dependencies.live.findRecording(claims.recordingId).then(async (recording) => {
      if (!recording || recording.sessionId !== sessionId)
        throw new ApplicationError('Recording not found', 'RECORDING_NOT_FOUND', 404)
      const session = await this.requireSession(sessionId)
      return {
        appId: this.dependencies.provider.appId,
        channelName: session.channelName,
        uid: Number(recording.recorderUid),
        rtcToken: this.dependencies.provider.createRtcToken(
          session.channelName,
          Number(recording.recorderUid),
          true,
          session.expiresAt ?? undefined,
        ),
        whiteboard: await this.whiteboard(session, `recorder-${recording.id}`, false),
        whiteboardActive: session.whiteboardActive,
      }
    })
  }

  private async join(session: LiveSession, actor: Actor, canPublish: boolean) {
    const now = new Date()
    const rtcUid = uidFor(actor.type, actor.id)
    const participant = await this.dependencies.live.upsertParticipant({
      sessionId: session.id,
      courseId: session.courseId,
      actorType: actor.type,
      actorId: actor.id,
      displayName: actor.displayName,
      rtcUid,
      joinedAt: now,
      leftAt: null,
      lastSeenAt: now,
      microphoneOn: false,
      cameraOn: false,
      screenSharing: false,
      handRaised: false,
      canPublish,
      kickedAt: null,
      bannedAt: null,
    })
    return {
      session,
      participant,
      appId: this.dependencies.provider.appId,
      channelName: session.channelName,
      rtcToken: this.dependencies.provider.createRtcToken(
        session.channelName,
        rtcUid,
        canPublish,
        session.expiresAt ?? undefined,
      ),
      uid: rtcUid,
      role: canPublish ? 'host' : 'audience',
      cameraDefaultOff: true,
      whiteboard: await this.whiteboard(session, `${actor.type}-${actor.id}`, canPublish),
    }
  }

  private async whiteboard(session: LiveSession, userId: string, writable: boolean) {
    if (!session.whiteboardRoomUuid) return null
    return {
      appIdentifier: this.dependencies.config.NETLESS_APP_IDENTIFIER,
      roomUuid: session.whiteboardRoomUuid,
      roomToken: await this.dependencies.provider.createWhiteboardToken(
        session.whiteboardRoomUuid,
        userId,
        writable,
      ),
      writable,
    }
  }

  private async state(session: LiveSession, after?: Date) {
    const now = new Date()
    await this.dependencies.live.markStaleParticipantsLeft(
      session.id,
      new Date(now.getTime() - 150_000),
      now,
    )
    return {
      session,
      participants: await this.dependencies.live.listParticipants(session.id),
      messages: await this.dependencies.live.listMessages(session.id, after),
    }
  }
  private async heartbeat(sessionId: string, actorType: LiveActorType, actorId: string) {
    const participant = await this.dependencies.live.findParticipantByActor(
      sessionId,
      actorType,
      actorId,
    )
    if (!participant || participant.kickedAt || participant.bannedAt) return
    await this.dependencies.live.updateParticipant(participant.id, {
      leftAt: null,
      lastSeenAt: new Date(),
    })
  }
  private async settleExpired(session: LiveSession): Promise<LiveSession> {
    if (session.status !== 'live' || !session.expiresAt || session.expiresAt.getTime() > Date.now())
      return session
    return this.dependencies.live.updateSession(session.id, {
      status: 'ended',
      endedAt: session.expiresAt,
      whiteboardActive: false,
    })
  }
  private async requireOwnedCourse(authorId: string, courseId: string) {
    const course = await this.dependencies.courses.findById(courseId)
    if (!course) throw new ApplicationError('Course not found', 'COURSE_NOT_FOUND', 404)
    if (course.course.createdByAuthorId !== authorId)
      throw new ApplicationError('You do not own this course', 'FORBIDDEN', 403)
    return course
  }
  private async requireEnrollment(studentId: string, courseId: string) {
    const enrollment = await this.dependencies.participation.findEnrollment(studentId, courseId)
    if (!enrollment)
      throw new ApplicationError('Enrollment is required', 'ENROLLMENT_REQUIRED', 403)
    return enrollment
  }
  private async requireSession(id: string) {
    const session = await this.dependencies.live.findSession(id)
    if (!session)
      throw new ApplicationError('Live session not found', 'LIVE_SESSION_NOT_FOUND', 404)
    return session
  }
  private async requireAuthorSession(authorId: string, id: string) {
    const session = await this.requireSession(id)
    if (session.authorId !== authorId)
      throw new ApplicationError(
        'Only the course author can manage this live class',
        'FORBIDDEN',
        403,
      )
    return session
  }
  private async requireActorParticipant(sessionId: string, type: LiveActorType, actorId: string) {
    const participant = await this.dependencies.live.findParticipantByActor(
      sessionId,
      type,
      actorId,
    )
    if (!participant || participant.leftAt || participant.bannedAt)
      throw new ApplicationError('Join the live class first', 'LIVE_PARTICIPANT_REQUIRED', 403)
    return participant
  }
  private async requireRecording(id: string, courseId: string) {
    const recording = await this.dependencies.live.findRecording(id)
    if (!recording || recording.courseId !== courseId)
      throw new ApplicationError('Recording not found', 'RECORDING_NOT_FOUND', 404)
    return recording
  }
}

const uidFor = (type: string, id: string): number =>
  createHash('sha256').update(`${type}:${id}`).digest().readUInt32BE(0) || 1
const requirePublicRecorderUrl = (value: string): void => {
  const hostname = new URL(value).hostname.toLowerCase()
  const isPrivateAddress =
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname.startsWith('127.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  if (isPrivateAddress)
    throw new ApplicationError(
      'Page recording requires STUDENT_APP_BASE_URL to be publicly reachable. Configure a public tunnel or deployed student-app URL and retry.',
      'LIVE_RECORDER_URL_NOT_PUBLIC',
      422,
    )
}
const actorFromAuthor = (actor: Author): Actor => ({
  type: 'author',
  id: actor.id,
  displayName: `${actor.firstName} ${actor.lastName}`.trim(),
})
const actorFromStudent = (actor: Student): Actor => ({
  type: 'student',
  id: actor.id,
  displayName: `${actor.firstName} ${actor.lastName}`.trim(),
})
const conflict = (message: string) => new ApplicationError(message, 'LIVE_CLASS_CONFLICT', 409)
