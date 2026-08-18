import { ApplicationError } from '../../entities/errors/applicationError'
import type {
  CourseAggregate,
  CourseCatalogRepository,
} from '../../entities/interfaces/courseRepository'
import type { CourseParticipationRepository } from '../../entities/interfaces/courseParticipationRepository'
import type { AuthorRepository } from '../../entities/interfaces/authorRepository'
import type { ObjectStorage, SignedUpload, UploadRequest } from '../../entities/interfaces/storage'
import type { Author } from '../../entities/models/Author'
import type { CourseAccessType, CourseType } from '../../entities/models/Course'
import type { AdminNotificationService } from '../admin/AdminNotificationService'

export interface CreateCourseInput {
  name: string
  durationMinutes: number
  type: CourseType
  liveCallDurationMinutes: number | null
  certificateOnCompletion: boolean
  scheduledAt?: Date | null
  accessType: CourseAccessType
  priceNaira: number
  modules: Array<{ title: string; content: string }>
  attachments: Array<{
    attachmentPath: string
    fileName?: string | null
    moduleId?: string | null
    moduleIndex?: number | null
  }>
}

export type UpdateCourseInput = Omit<CreateCourseInput, 'modules' | 'attachments'>

export interface CoursePreview {
  course: CourseAggregate['course']
  modules: Array<Pick<CourseAggregate['modules'][number], 'id' | 'courseId' | 'title' | 'order'>>
  attachments: Array<{
    id: string
    courseId: string
    courseName: string
    fileName: string
  }>
}

const MAX_COURSE_ATTACHMENTS = 10

export class CourseService {
  constructor(
    private readonly dependencies: {
      courses: CourseCatalogRepository
      authors: AuthorRepository
      storage: ObjectStorage
      participation: CourseParticipationRepository
      notifications: AdminNotificationService
    },
  ) {}

  async create(author: Author, input: CreateCourseInput): Promise<CourseAggregate> {
    this.assertLiveClassDuration(input.type, input.liveCallDurationMinutes)
    const priceKobo = this.priceInKobo(input.accessType, input.priceNaira)
    this.assertAttachmentLimit(input.attachments.length)
    this.assertAttachmentModuleIndexes(input.attachments, input.modules.length)
    await this.assertAttachments(
      author.id,
      input.attachments.map((item) => item.attachmentPath),
    )
    const aggregate = await this.dependencies.courses.create({
      course: {
        name: input.name.trim(),
        durationMinutes: input.durationMinutes,
        type: input.type,
        liveCallDurationMinutes: input.liveCallDurationMinutes,
        certificateOnCompletion: input.certificateOnCompletion,
        scheduledAt: input.scheduledAt ?? null,
        accessType: input.accessType,
        priceKobo,
        createdByAuthorId: author.id,
      },
      modules: input.modules.map((module) => ({
        title: module.title.trim(),
        content: module.content.trim(),
      })),
      attachments: input.attachments,
    })
    await this.dependencies.notifications.publish({
      title: 'Course published',
      body: `${aggregate.course.name} was published by ${author.firstName} ${author.lastName}.`,
      link: `/courses/${aggregate.course.id}`,
    })
    return aggregate
  }

  async addModule(author: Author, courseId: string, input: { title: string; content: string }) {
    const aggregate = await this.ownedCourse(author, courseId)
    const module = await this.dependencies.courses.addModule(aggregate.course, {
      title: input.title.trim(),
      content: input.content.trim(),
    })
    await this.dependencies.participation.resetCourseCompletion(courseId)
    return module
  }

  async update(
    author: Author,
    courseId: string,
    input: UpdateCourseInput,
  ): Promise<CourseAggregate> {
    await this.ownedCourse(author, courseId)
    this.assertLiveClassDuration(input.type, input.liveCallDurationMinutes)
    const priceKobo = this.priceInKobo(input.accessType, input.priceNaira)
    const updated = await this.dependencies.courses.updateCourse(courseId, {
      name: input.name.trim(),
      durationMinutes: input.durationMinutes,
      type: input.type,
      liveCallDurationMinutes: input.liveCallDurationMinutes,
      certificateOnCompletion: input.certificateOnCompletion,
      scheduledAt: input.scheduledAt ?? null,
      accessType: input.accessType,
      priceKobo,
    })
    if (!updated) throw new ApplicationError('Course not found', 'COURSE_NOT_FOUND', 404)
    const aggregate = await this.dependencies.courses.findById(courseId)
    if (!aggregate) throw new ApplicationError('Course not found', 'COURSE_NOT_FOUND', 404)
    return aggregate
  }

  async addAttachment(
    author: Author,
    courseId: string,
    input: { attachmentPath: string; fileName?: string | null },
  ) {
    const aggregate = await this.ownedCourse(author, courseId)
    this.assertAttachmentLimit(aggregate.attachments.length + 1)
    await this.assertAttachments(author.id, [input.attachmentPath])
    return this.dependencies.courses.addAttachment(aggregate.course, input)
  }

  async getAvailable(courseId: string): Promise<CourseAggregate> {
    const aggregate = await this.dependencies.courses.findById(courseId)
    if (!aggregate) throw new ApplicationError('Course not found', 'COURSE_NOT_FOUND', 404)
    if (aggregate.course.scheduledAt && aggregate.course.scheduledAt.getTime() > Date.now()) {
      throw new ApplicationError(
        `Course will be available on ${aggregate.course.scheduledAt.toISOString()}`,
        'COURSE_NOT_AVAILABLE',
        403,
      )
    }
    return aggregate
  }

  async getPreview(courseId: string): Promise<CoursePreview> {
    const aggregate = await this.getAvailable(courseId)
    return {
      course: aggregate.course,
      modules: aggregate.modules.map(({ id, courseId: moduleCourseId, title, order }) => ({
        id,
        courseId: moduleCourseId,
        title,
        order,
      })),
      attachments: aggregate.attachments.map((attachment) => ({
        id: attachment.id,
        courseId: attachment.courseId,
        courseName: attachment.courseName,
        fileName:
          attachment.fileName ?? attachment.attachmentPath.split('/').at(-1) ?? 'Course attachment',
      })),
    }
  }

  async listOwned(author: Author) {
    return this.dependencies.courses.findByAuthor(author.id)
  }

  async listAvailable(query = '') {
    const courses = await this.dependencies.courses.findAvailable(new Date())
    const authorIds = [...new Set(courses.map((course) => course.createdByAuthorId))]
    const authors = await Promise.all(authorIds.map((authorId) => this.dependencies.authors.findById(authorId)))
    const authorNames = new Map(
      authors.filter((author): author is NonNullable<typeof author> => Boolean(author)).map((author) => [
        author.id,
        `${author.firstName} ${author.lastName}`,
      ]),
    )
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return courses
      .map((course) => ({
        ...course,
        authorName: authorNames.get(course.createdByAuthorId) ?? 'DANVIC author',
      }))
      .filter(
        (course) =>
          !normalizedQuery ||
          course.name.toLocaleLowerCase().includes(normalizedQuery) ||
          course.authorName.toLocaleLowerCase().includes(normalizedQuery),
      )
  }

  async getPublicAuthorProfile(authorId: string) {
    const author = await this.dependencies.authors.findById(authorId)
    if (!author || author.disabledAt)
      throw new ApplicationError('Author not found', 'AUTHOR_NOT_FOUND', 404)
    const [availableCourses, rating] = await Promise.all([
      this.listAvailable(),
      this.dependencies.participation.getAuthorRatingSummary(author.id),
    ])
    const courses = availableCourses.filter(
      (course) => course.createdByAuthorId === author.id,
    )
    return {
      author: {
        id: author.id,
        firstName: author.firstName,
        lastName: author.lastName,
        bio: author.bio,
        linkedInUrl: author.linkedInUrl,
        xUrl: author.xUrl,
        instagramUrl: author.instagramUrl,
        facebookUrl: author.facebookUrl,
        websiteUrl: author.websiteUrl,
      },
      courses,
      rating,
    }
  }

  async createAttachmentDownload(courseId: string, attachmentId: string) {
    const aggregate = await this.getAvailable(courseId)
    const attachment = aggregate.attachments.find((item) => item.id === attachmentId)
    if (!attachment)
      throw new ApplicationError('Course attachment not found', 'ATTACHMENT_NOT_FOUND', 404)
    return this.dependencies.storage.createSignedDownload(attachment.attachmentPath)
  }

  async createAttachmentView(courseId: string, attachmentId: string) {
    const aggregate = await this.dependencies.courses.findById(courseId)
    if (!aggregate) throw new ApplicationError('Course not found', 'COURSE_NOT_FOUND', 404)
    const attachment = aggregate.attachments.find((item) => item.id === attachmentId)
    if (!attachment)
      throw new ApplicationError('Course attachment not found', 'ATTACHMENT_NOT_FOUND', 404)
    return {
      ...(await this.dependencies.storage.createSignedView(attachment.attachmentPath)),
      fileName:
        attachment.fileName ?? attachment.attachmentPath.split('/').at(-1) ?? 'Course attachment',
      viewOnly: true,
    }
  }

  async createSignedUpload(
    author: Author,
    input: Omit<UploadRequest, 'ownerId'>,
  ): Promise<SignedUpload> {
    return this.dependencies.storage.createSignedUpload({ ...input, ownerId: author.id })
  }

  private assertLiveClassDuration(type: CourseType, duration: number | null): void {
    if (type === 'live' && (!duration || duration < 10 || duration > 300 || duration % 10 !== 0))
      throw new ApplicationError(
        'Live courses require a call duration from 10 minutes to 5 hours, in 10-minute intervals',
        'VALIDATION_ERROR',
        400,
      )
    if (type === 'premade' && duration !== null)
      throw new ApplicationError(
        'Premade courses cannot have a live call duration',
        'VALIDATION_ERROR',
        400,
      )
  }

  private priceInKobo(accessType: CourseAccessType, priceNaira: number): number {
    const priceKobo = Math.round(priceNaira * 100)
    if (
      !Number.isSafeInteger(priceKobo) ||
      Math.abs(priceNaira * 100 - priceKobo) > Number.EPSILON * Math.max(1, Math.abs(priceKobo)) * 4
    )
      throw new ApplicationError(
        'Course prices can have no more than two decimal places',
        'INVALID_COURSE_PRICE',
        400,
      )
    if (accessType === 'free' && priceKobo !== 0)
      throw new ApplicationError('Free courses must have a zero price', 'INVALID_COURSE_PRICE', 400)
    if (accessType === 'paid' && priceKobo < 1)
      throw new ApplicationError(
        'Paid courses must cost at least one kobo',
        'INVALID_COURSE_PRICE',
        400,
      )
    return accessType === 'free' ? 0 : priceKobo
  }

  private async ownedCourse(author: Author, courseId: string): Promise<CourseAggregate> {
    const aggregate = await this.dependencies.courses.findById(courseId)
    if (!aggregate) throw new ApplicationError('Course not found', 'COURSE_NOT_FOUND', 404)
    if (aggregate.course.createdByAuthorId !== author.id)
      throw new ApplicationError('Only the course author can modify this course', 'FORBIDDEN', 403)
    return aggregate
  }

  private async assertAttachments(authorId: string, paths: string[]): Promise<void> {
    for (const path of paths) {
      if (
        !path.startsWith(`courses/${authorId}/`) ||
        !(await this.dependencies.storage.exists(path))
      ) {
        throw new ApplicationError(
          'Attachment path is invalid or the upload is incomplete',
          'INVALID_ATTACHMENT',
          400,
        )
      }
    }
  }

  private assertAttachmentLimit(count: number): void {
    if (count > MAX_COURSE_ATTACHMENTS) {
      throw new ApplicationError(
        `A course can have no more than ${MAX_COURSE_ATTACHMENTS} attachments`,
        'COURSE_ATTACHMENT_LIMIT_REACHED',
        400,
      )
    }
  }

  private assertAttachmentModuleIndexes(
    attachments: CreateCourseInput['attachments'],
    moduleCount: number,
  ): void {
    if (
      attachments.some(
        (attachment) =>
          attachment.moduleIndex != null &&
          (!Number.isInteger(attachment.moduleIndex) ||
            attachment.moduleIndex < 0 ||
            attachment.moduleIndex >= moduleCount),
      )
    ) {
      throw new ApplicationError(
        'A module attachment must reference a module in this course',
        'INVALID_ATTACHMENT_MODULE',
        400,
      )
    }
  }
}
