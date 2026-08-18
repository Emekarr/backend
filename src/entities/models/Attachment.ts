import type { BaseEntity } from './base'

export interface Attachment extends BaseEntity {
  courseId: string
  courseName: string
  moduleId: string | null
  attachmentPath: string
  fileName: string | null
}

export type CreateAttachment = Omit<Attachment, keyof BaseEntity | 'moduleId' | 'fileName'> & {
  moduleId?: string | null
  fileName?: string | null
}
