import type { BaseEntity } from './base'

export interface LiveReminderPreference extends BaseEntity {
  authorId: string
  courseId: string
  enabled: boolean
  reminderAt: Date | null
  deliveredAt: Date | null
  deliveryError: string | null
}

export type CreateLiveReminderPreference = Omit<LiveReminderPreference, keyof BaseEntity>
