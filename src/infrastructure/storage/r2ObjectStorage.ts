import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { ObjectStorage, SignedUpload, UploadRequest } from '../../entities/interfaces/storage'
import type { EnvironmentConfig } from '../config/environment'
import { generateID } from '../identifiers/generators'

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/zip': 'zip',
}

const MAX_COURSE_UPLOAD_BYTES = 1024 * 1024 * 1024

export class R2ObjectStorage implements ObjectStorage {
  private readonly client: S3Client
  private readonly bucket: string
  private readonly publicBaseUrl?: string

  constructor(config: EnvironmentConfig) {
    this.bucket = config.R2_BUCKET_NAME
    this.publicBaseUrl = config.R2_PUBLIC_BASE_URL
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.R2_ACCESS_KEY_ID,
        secretAccessKey: config.R2_SECRET_ACCESS_KEY,
      },
    })
  }

  async createSignedUpload(input: UploadRequest): Promise<SignedUpload> {
    const extension = EXTENSIONS[input.contentType]
    if (!extension) throw new Error('Unsupported upload content type')
    const attachmentPath = `courses/${input.ownerId}/${generateID()}.${extension}`
    const expiresInSeconds = 15 * 60
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: attachmentPath,
      ContentType: input.contentType,
    })
    return {
      uploadUrl: await getSignedUrl(this.client, command, {
        expiresIn: expiresInSeconds,
        // Cloudflare's R2 browser-upload flow requires Content-Type to be part of the
        // signature and the client to send the same header with its PUT request.
        signableHeaders: new Set(['content-type']),
      }),
      attachmentPath,
      ...(this.publicBaseUrl ? { publicUrl: `${this.publicBaseUrl}/${attachmentPath}` } : {}),
      expiresInSeconds,
      requiredHeaders: {
        'content-type': input.contentType,
      },
    }
  }

  async exists(attachmentPath: string): Promise<boolean> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: attachmentPath }),
      )
      const expectedExtension = EXTENSIONS[result.ContentType ?? '']
      return (
        Boolean(expectedExtension) &&
        attachmentPath.endsWith(`.${expectedExtension}`) &&
        typeof result.ContentLength === 'number' &&
        result.ContentLength > 0 &&
        result.ContentLength <= MAX_COURSE_UPLOAD_BYTES
      )
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'name' in error &&
        (error.name === 'NotFound' || error.name === 'NoSuchKey')
      )
        return false
      throw error
    }
  }

  async createSignedDownload(
    attachmentPath: string,
  ): Promise<{ downloadUrl: string; expiresInSeconds: number }> {
    const expiresInSeconds = 5 * 60
    return {
      downloadUrl: await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: attachmentPath,
          ResponseContentDisposition: 'attachment',
        }),
        { expiresIn: expiresInSeconds },
      ),
      expiresInSeconds,
    }
  }

  async createSignedView(
    attachmentPath: string,
  ): Promise<{ viewUrl: string; expiresInSeconds: number }> {
    const expiresInSeconds = 5 * 60
    return {
      viewUrl: await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: attachmentPath,
          ResponseContentDisposition: 'inline',
        }),
        { expiresIn: expiresInSeconds },
      ),
      expiresInSeconds,
    }
  }
}
