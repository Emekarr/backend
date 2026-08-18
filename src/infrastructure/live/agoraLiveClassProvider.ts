import { RtcRole, RtcTokenBuilder } from 'agora-token'
import { ApplicationError } from '../../entities/errors/applicationError'
import type {
  AgoraRecordingResult,
  LiveClassProvider,
} from '../../entities/interfaces/liveClassRepository'
import type { LiveRecordingFile, LiveRecordingType } from '../../entities/models/LiveClass'
import type { EnvironmentConfig } from '../config/environment'

type JsonObject = Record<string, unknown>

export class AgoraLiveClassProvider implements LiveClassProvider {
  readonly appId: string
  private readonly certificate: string

  constructor(private readonly config: EnvironmentConfig) {
    this.appId = config.AGORA_APP_ID ?? ''
    this.certificate = config.AGORA_APP_CERTIFICATE ?? ''
  }

  createRtcToken(channelName: string, uid: number, canPublish: boolean, expiresAt?: Date): string {
    this.requireRtc()
    const maxLifetime = 60 * 60 * 6
    const lifetime = expiresAt
      ? Math.min(maxLifetime, Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 1000)))
      : maxLifetime
    return RtcTokenBuilder.buildTokenWithUid(
      this.appId,
      this.certificate,
      channelName,
      uid,
      canPublish ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER,
      lifetime,
      lifetime,
    )
  }

  async createWhiteboardRoom(): Promise<string> {
    this.requireWhiteboard()
    const value = await this.netless('/v5/rooms', {
      method: 'POST',
      body: JSON.stringify({ isRecord: false }),
    })
    const uuid =
      value && typeof value === 'object' ? readString(value as JsonObject, 'uuid') : undefined
    if (!uuid) throw upstream('Agora Whiteboard did not return a room UUID')
    return uuid
  }

  async createWhiteboardToken(
    roomUuid: string,
    _userId: string,
    writable: boolean,
  ): Promise<string> {
    this.requireWhiteboard()
    const value = await this.netless(`/v5/tokens/rooms/${encodeURIComponent(roomUuid)}`, {
      method: 'POST',
      body: JSON.stringify({ lifespan: 21600000, role: writable ? 'writer' : 'reader' }),
    })
    if (typeof value !== 'string') throw upstream('Agora Whiteboard did not return a room token')
    return value
  }

  async acquireRecording(channelName: string, recorderUid: string): Promise<string> {
    this.requireRecording()
    const value = await this.agora(`/v1/apps/${this.appId}/cloud_recording/acquire`, {
      method: 'POST',
      body: JSON.stringify({
        cname: channelName,
        uid: recorderUid,
        clientRequest: { resourceExpiredHour: 24 },
      }),
    })
    const resourceId = readString(value, 'resourceId')
    if (!resourceId) throw upstream('Agora did not return a recording resource ID')
    return resourceId
  }

  async startRecording(input: {
    resourceId: string
    channelName: string
    recorderUid: string
    type: LiveRecordingType
    courseId: string
    recordingId: string
    recorderPageUrl: string
  }): Promise<AgoraRecordingResult> {
    this.requireRecording()
    const mode = input.type === 'web' ? 'web' : 'mix'
    const token = this.createRtcToken(input.channelName, Number(input.recorderUid), true)
    const storageConfig = this.storageConfig(input.courseId, input.recordingId)
    const clientRequest: JsonObject =
      input.type === 'web'
        ? {
            token,
            extensionServiceConfig: {
              errorHandlePolicy: 'error_abort',
              extensionServices: [
                {
                  serviceName: 'web_recorder_service',
                  errorHandlePolicy: 'error_abort',
                  serviceParam: {
                    url: input.recorderPageUrl,
                    audioProfile: 0,
                    videoWidth: 1920,
                    videoHeight: 1080,
                    videoFps: 30,
                  },
                },
              ],
            },
            recordingFileConfig: { avFileType: ['hls', 'mp4'] },
            storageConfig,
          }
        : {
            token,
            recordingConfig: {
              channelType: 1,
              streamTypes: 0,
              audioProfile: 1,
              maxIdleTime: 30,
              subscribeAudioUids: ['#allstream#'],
            },
            recordingFileConfig: { avFileType: ['hls', 'mp4'] },
            storageConfig,
          }
    const value = await this.agora(
      `/v1/apps/${this.appId}/cloud_recording/resourceid/${input.resourceId}/mode/${mode}/start`,
      {
        method: 'POST',
        body: JSON.stringify({ cname: input.channelName, uid: input.recorderUid, clientRequest }),
      },
    )
    return recordingResult(value, input.resourceId)
  }

  async stopRecording(input: {
    resourceId: string
    sid: string
    channelName: string
    recorderUid: string
    type: LiveRecordingType
  }): Promise<AgoraRecordingResult> {
    this.requireRecording()
    const mode = input.type === 'web' ? 'web' : 'mix'
    const value = await this.agora(
      `/v1/apps/${this.appId}/cloud_recording/resourceid/${input.resourceId}/sid/${input.sid}/mode/${mode}/stop`,
      {
        method: 'POST',
        body: JSON.stringify({
          cname: input.channelName,
          uid: input.recorderUid,
          clientRequest: {},
        }),
      },
    )
    return recordingResult(value, input.resourceId)
  }

  async banParticipant(
    channelName: string,
    uid: number,
    privileges: Array<'join_channel' | 'publish_audio' | 'publish_video'>,
    durationMinutes: number,
  ): Promise<void> {
    this.requireRecording()
    await this.agora(
      '/dev/v1/kicking-rule',
      {
        method: 'POST',
        body: JSON.stringify({
          appid: this.appId,
          cname: channelName,
          uid: String(uid),
          ip: '',
          time: durationMinutes,
          privileges,
        }),
      },
      'https://api.agora.io',
    )
  }

  async ingestRecording(sourceUrl: string, name: string): Promise<string> {
    const account = this.config.CLOUDFLARE_STREAM_ACCOUNT_ID
    const token = this.config.CLOUDFLARE_STREAM_API_TOKEN
    if (!account || !token) throw feature('Cloudflare Stream')
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/stream/copy`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          url: sourceUrl,
          meta: { name },
          requireSignedURLs: true,
          allowedOrigins: [new URL(this.config.STUDENT_APP_BASE_URL).hostname],
        }),
      },
    )
    const value = await json(response)
    const uid = readString((value.result as JsonObject | undefined) ?? {}, 'uid')
    if (!response.ok || !uid)
      throw upstream(message(value, 'Cloudflare Stream could not import the recording'))
    return uid
  }

  async playbackUrl(streamVideoId: string): Promise<string> {
    const account = this.config.CLOUDFLARE_STREAM_ACCOUNT_ID
    const token = this.config.CLOUDFLARE_STREAM_API_TOKEN
    const customerCode = this.config.CLOUDFLARE_STREAM_CUSTOMER_CODE
    if (!account || !token || !customerCode) throw feature('Cloudflare Stream')
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/stream/${streamVideoId}/token`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 60 * 30, downloadable: false }),
      },
    )
    const value = await json(response)
    const signedToken = readString((value.result as JsonObject | undefined) ?? {}, 'token')
    if (!response.ok || !signedToken)
      throw upstream(message(value, 'Cloudflare Stream could not create a playback token'))
    return `https://customer-${customerCode}.cloudflarestream.com/${signedToken}/iframe`
  }

  private storageConfig(courseId: string, recordingId: string): JsonObject {
    return {
      vendor: 11,
      region: 0,
      bucket: this.config.R2_BUCKET_NAME,
      accessKey: this.config.R2_ACCESS_KEY_ID,
      secretKey: this.config.R2_SECRET_ACCESS_KEY,
      fileNamePrefix: ['recordings', courseId, recordingId],
      extensionParams: {
        endpoint: `https://${this.config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      },
    }
  }

  private async agora(
    path: string,
    init: RequestInit,
    origin = 'https://api.sd-rtn.com',
  ): Promise<JsonObject> {
    const id = this.config.AGORA_CUSTOMER_ID
    const secret = this.config.AGORA_CUSTOMER_SECRET
    if (!id || !secret) throw feature('Agora Cloud Recording')
    const response = await fetch(`${origin}${path}`, {
      ...init,
      headers: {
        authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
        'content-type': 'application/json',
        ...init.headers,
      },
    })
    const value = await json(response)
    if (!response.ok) throw upstream(message(value, 'Agora request failed'))
    return value
  }

  private async netless(path: string, init: RequestInit): Promise<unknown> {
    const response = await fetch(`https://api.netless.link${path}`, {
      ...init,
      headers: {
        token: this.config.NETLESS_SDK_TOKEN ?? '',
        region: 'us-sv',
        'content-type': 'application/json',
        ...init.headers,
      },
    })
    const text = await response.text()
    let value: unknown = text
    try {
      value = JSON.parse(text)
    } catch {
      /* non-JSON response: keep the raw text (e.g. error messages) */
    }
    if (!response.ok)
      throw upstream(
        typeof value === 'object'
          ? message(value as JsonObject, 'Agora Whiteboard request failed')
          : text,
      )
    return value
  }

  private requireRtc(): void {
    if (!this.appId || !this.certificate) throw feature('Agora RTC')
  }
  private requireRecording(): void {
    this.requireRtc()
    if (!this.config.AGORA_CUSTOMER_ID || !this.config.AGORA_CUSTOMER_SECRET)
      throw feature('Agora Cloud Recording')
  }
  private requireWhiteboard(): void {
    if (!this.config.NETLESS_APP_IDENTIFIER || !this.config.NETLESS_SDK_TOKEN)
      throw feature('Agora Whiteboard')
  }
}

const json = async (response: Response): Promise<JsonObject> => {
  try {
    return (await response.json()) as JsonObject
  } catch {
    return {}
  }
}
const readString = (value: JsonObject, key: string): string | undefined =>
  typeof value[key] === 'string' ? value[key] : undefined
const message = (value: JsonObject, fallback: string): string =>
  typeof value.message === 'string' ? value.message : fallback
const feature = (name: string) =>
  new ApplicationError(`${name} is not configured`, 'LIVE_CLASS_NOT_CONFIGURED', 503)
const upstream = (text: string) => new ApplicationError(text, 'LIVE_CLASS_PROVIDER_ERROR', 502)
const recordingResult = (value: JsonObject, resourceId: string): AgoraRecordingResult => {
  const sid = readString(value, 'sid')
  if (!sid) throw upstream('Agora did not return a recording SID')
  const serverResponse = (value.serverResponse as JsonObject | undefined) ?? {}
  const rawFiles = Array.isArray(serverResponse.fileList) ? serverResponse.fileList : []
  const files: LiveRecordingFile[] = rawFiles.flatMap((item) => {
    if (!item || typeof item !== 'object' || typeof (item as JsonObject).fileName !== 'string')
      return []
    const file = item as JsonObject
    return [
      {
        fileName: file.fileName as string,
        trackType: typeof file.trackType === 'string' ? file.trackType : undefined,
        uid: typeof file.uid === 'string' ? file.uid : undefined,
        mixedAllUser: typeof file.mixedAllUser === 'boolean' ? file.mixedAllUser : undefined,
        isPlayable: typeof file.isPlayable === 'boolean' ? file.isPlayable : undefined,
      },
    ]
  })
  return { sid, resourceId, files }
}
