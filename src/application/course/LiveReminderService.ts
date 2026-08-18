import { ApplicationError } from '../../entities/errors/applicationError'
import type { CourseCatalogRepository } from '../../entities/interfaces/courseRepository'
import type { LiveReminderPreferenceRepository } from '../../entities/interfaces/liveReminderPreferenceRepository'
import type { EmailJobQueue } from '../../entities/interfaces/services'
import type { Author } from '../../entities/models/Author'

const REMINDER_LEAD_MS = 24 * 60 * 60 * 1_000

export class LiveReminderService {
  constructor(
    private readonly dependencies: {
      courses: CourseCatalogRepository
      preferences: LiveReminderPreferenceRepository
      emailJobs: EmailJobQueue
    },
  ) {}

  async set(author: Author, courseId: string, enabled: boolean) {
    const course = await this.dependencies.courses.findById(courseId)
    if (!course) throw new ApplicationError('Course not found', 'COURSE_NOT_FOUND', 404)
    if (course.course.createdByAuthorId !== author.id)
      throw new ApplicationError('Only the course author can manage reminders', 'FORBIDDEN', 403)
    if (enabled && (course.course.type !== 'live' || !course.course.scheduledAt))
      throw new ApplicationError(
        'Only scheduled live courses can have reminders',
        'REMINDER_NOT_AVAILABLE',
        409,
      )

    const jobId = reminderJobId(author.id, courseId)
    await this.dependencies.emailJobs.cancel(jobId)
    if (!enabled) {
      const preference = await this.dependencies.preferences.save({
        authorId: author.id,
        courseId,
        enabled: false,
        reminderAt: null,
        deliveredAt: null,
        deliveryError: null,
      })
      return publicPreference(preference)
    }

    const reminderAt = new Date(
      Math.max(Date.now() + 1_000, course.course.scheduledAt!.getTime() - REMINDER_LEAD_MS),
    )
    const preference = await this.dependencies.preferences.save({
      authorId: author.id,
      courseId,
      enabled: true,
      reminderAt,
      deliveredAt: null,
      deliveryError: null,
    })
    await this.dependencies.emailJobs.schedule(
      {
        type: 'live-reminder',
        authorId: author.id,
        courseId,
        email: author.email,
        courseName: course.course.name,
        scheduledAt: course.course.scheduledAt!.toISOString(),
      },
      { jobId, delayMs: Math.max(0, reminderAt.getTime() - Date.now()) },
    )
    return publicPreference(preference)
  }

  async list(author: Author) {
    const preferences = await this.dependencies.preferences.listForAuthor(author.id)
    return { preferences: preferences.map(publicPreference) }
  }
}

const reminderJobId = (authorId: string, courseId: string) =>
  `live-reminder:${authorId}:${courseId}`

const publicPreference = (preference: {
  courseId: string
  enabled: boolean
  reminderAt: Date | null
  deliveredAt: Date | null
  deliveryError: string | null
  updatedAt: Date
}) => ({
  courseId: preference.courseId,
  enabled: preference.enabled,
  reminderAt: preference.reminderAt,
  deliveredAt: preference.deliveredAt,
  deliveryError: preference.deliveryError,
  updatedAt: preference.updatedAt,
})
