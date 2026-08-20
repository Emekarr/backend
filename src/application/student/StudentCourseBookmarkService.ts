import { ApplicationError } from '../../entities/errors/applicationError'
import type { CourseCatalogRepository } from '../../entities/interfaces/courseRepository'
import type { EmailJobQueue } from '../../entities/interfaces/services'
import type { StudentCourseBookmarkRepository } from '../../entities/interfaces/studentCourseBookmarkRepository'
import type { Student } from '../../entities/models/Student'

const REMINDER_LEADS = [30, 10] as const

export class StudentCourseBookmarkService {
  constructor(
    private readonly dependencies: {
      courses: CourseCatalogRepository
      bookmarks: StudentCourseBookmarkRepository
      emailJobs: EmailJobQueue
    },
  ) {}

  async set(student: Student, courseId: string, enabled: boolean) {
    const aggregate = await this.dependencies.courses.findById(courseId)
    if (!aggregate) throw new ApplicationError('Course not found', 'COURSE_NOT_FOUND', 404)
    const { course } = aggregate
    if (enabled && (course.type !== 'live' || !course.scheduledAt))
      throw new ApplicationError(
        'Only scheduled live courses can be bookmarked',
        'BOOKMARK_NOT_AVAILABLE',
        409,
      )
    if (enabled && course.scheduledAt!.getTime() <= Date.now())
      throw new ApplicationError(
        'This live course has already started',
        'COURSE_ALREADY_STARTED',
        409,
      )

    await Promise.all(
      REMINDER_LEADS.map((leadMinutes) =>
        this.dependencies.emailJobs.cancel(bookmarkJobId(student.id, courseId, leadMinutes)),
      ),
    )

    const bookmark = await this.dependencies.bookmarks.save({
      studentId: student.id,
      courseId,
      enabled,
      scheduledAt: enabled ? course.scheduledAt : null,
      delivered30At: null,
      delivered10At: null,
      delivery30Error: null,
      delivery10Error: null,
    })

    if (enabled) {
      for (const leadMinutes of REMINDER_LEADS) {
        const reminderAt = course.scheduledAt!.getTime() - leadMinutes * 60 * 1_000
        // If a learner bookmarks late, send the elapsed reminder immediately rather
        // than silently dropping one of the two reminders they asked for.
        const delayMs = Math.max(1_000, reminderAt - Date.now())
        await this.dependencies.emailJobs.schedule(
          {
            type: 'student-live-reminder',
            studentId: student.id,
            courseId,
            email: student.email,
            courseName: course.name,
            scheduledAt: course.scheduledAt!.toISOString(),
            leadMinutes,
          },
          { jobId: bookmarkJobId(student.id, courseId, leadMinutes), delayMs },
        )
      }
    }

    return publicBookmark(bookmark)
  }

  async list(student: Student) {
    const bookmarks = await this.dependencies.bookmarks.listForStudent(student.id)
    return { bookmarks: bookmarks.map(publicBookmark) }
  }
}

const bookmarkJobId = (studentId: string, courseId: string, leadMinutes: 30 | 10) =>
  `student-live-reminder:${studentId}:${courseId}:${leadMinutes}`

const publicBookmark = (bookmark: {
  courseId: string
  enabled: boolean
  scheduledAt: Date | null
  delivered30At: Date | null
  delivered10At: Date | null
  updatedAt: Date
}) => ({
  courseId: bookmark.courseId,
  enabled: bookmark.enabled,
  scheduledAt: bookmark.scheduledAt,
  delivered30At: bookmark.delivered30At,
  delivered10At: bookmark.delivered10At,
  updatedAt: bookmark.updatedAt,
})
