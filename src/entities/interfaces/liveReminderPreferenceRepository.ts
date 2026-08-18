import type {
  CreateLiveReminderPreference,
  LiveReminderPreference,
} from '../models/LiveReminderPreference'

export interface LiveReminderPreferenceRepository {
  find(authorId: string, courseId: string): Promise<LiveReminderPreference | null>
  listForAuthor(authorId: string): Promise<LiveReminderPreference[]>
  save(input: CreateLiveReminderPreference): Promise<LiveReminderPreference>
  markDelivered(authorId: string, courseId: string, deliveredAt: Date): Promise<void>
  markDeliveryFailed(authorId: string, courseId: string, message: string): Promise<void>
}
