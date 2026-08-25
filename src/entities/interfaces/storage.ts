export interface UploadRequest {
  ownerId: string
  fileName: string
  contentType: string
  sizeBytes: number
}

export interface SignedUpload {
  uploadUrl: string
  attachmentPath: string
  /** A short-lived inline URL for displaying a just-uploaded file. */
  viewUrl: string
  publicUrl?: string
  expiresInSeconds: number
  requiredHeaders: Record<string, string>
}

export interface ObjectStorage {
  createSignedUpload(input: UploadRequest): Promise<SignedUpload>
  createSignedDownload(
    attachmentPath: string,
  ): Promise<{ downloadUrl: string; expiresInSeconds: number }>
  createSignedView(attachmentPath: string): Promise<{ viewUrl: string; expiresInSeconds: number }>
  exists(attachmentPath: string): Promise<boolean>
}
