import mongoose, { type Model } from 'mongoose'
import type {
  CourseAggregate,
  CourseCatalogRepository,
} from '../../../../entities/interfaces/courseRepository'
import type { Attachment } from '../../../../entities/models/Attachment'
import type { Course } from '../../../../entities/models/Course'
import type { CourseModule } from '../../../../entities/models/CourseModule'
import { AttachmentSchema } from '../models/Attachment'
import { CourseSchema } from '../models/Course'
import { CourseModuleSchema } from '../models/CourseModule'

export class CourseCatalogRepo implements CourseCatalogRepository {
  private readonly courses: Model<Course> =
    (mongoose.models.Course as Model<Course> | undefined) ?? mongoose.model('Course', CourseSchema)
  private readonly modules: Model<CourseModule> =
    (mongoose.models.CourseModule as Model<CourseModule> | undefined) ??
    mongoose.model('CourseModule', CourseModuleSchema)
  private readonly attachments: Model<Attachment> =
    (mongoose.models.Attachment as Model<Attachment> | undefined) ??
    mongoose.model('Attachment', AttachmentSchema)

  async create(input: Parameters<CourseCatalogRepository['create']>[0]): Promise<CourseAggregate> {
    const courseDocument = await this.courses.create(input.course)
    const course = cleanCourse(courseDocument.toObject())
    try {
      const moduleDocuments = await this.modules.create(
        input.modules.map((item, order) => ({ ...item, order, courseId: course.id })),
      )
      const attachmentDocuments = await this.attachments.create(
        input.attachments.map(({ moduleIndex, ...item }) => ({
          ...item,
          courseId: course.id,
          courseName: course.name,
          moduleId:
            moduleIndex == null
              ? (item.moduleId ?? null)
              : (moduleDocuments[moduleIndex]?.id ?? null),
        })),
      )
      return {
        course,
        modules: moduleDocuments.map((item) => clean<CourseModule>(item.toObject())),
        attachments: attachmentDocuments.map((item) => clean<Attachment>(item.toObject())),
      }
    } catch (error) {
      await Promise.allSettled([
        this.modules.deleteMany({ courseId: course.id }),
        this.attachments.deleteMany({ courseId: course.id }),
        this.courses.deleteOne({ id: course.id }),
      ])
      throw error
    }
  }

  async findById(id: string): Promise<CourseAggregate | null> {
    const courseDocument = await this.courses.findOne({ id }).lean().exec()
    if (!courseDocument) return null
    const [modules, attachments] = await Promise.all([
      this.modules.find({ courseId: id }).sort({ order: 1 }).lean().exec(),
      this.attachments.find({ courseId: id }).sort({ createdAt: 1 }).lean().exec(),
    ])
    return {
      course: cleanCourse(courseDocument),
      modules: modules.map((item) => clean<CourseModule>(item)),
      attachments: attachments.map((item) => clean<Attachment>(item)),
    }
  }

  async findAll(): Promise<Course[]> {
    const documents = await this.courses
      .find(currentCourseFilter)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean()
      .exec()
    return documents.map(cleanCourse)
  }

  async findByAuthor(authorId: string): Promise<Course[]> {
    const documents = await this.courses
      .find({ createdByAuthorId: authorId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
      .exec()
    return documents.map(cleanCourse)
  }

  async findAvailable(now: Date): Promise<Course[]> {
    const documents = await this.courses
      .find({
        $and: [
          currentCourseFilter,
          // Live courses need to be discoverable before they begin so learners can see
          // their start time. A scheduled premade course remains hidden until release.
          {
            $or: [{ type: 'live' }, { scheduledAt: null }, { scheduledAt: { $lte: now } }],
          },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
      .exec()
    return documents.map(cleanCourse)
  }

  async updateCourse(
    id: string,
    input: Pick<
      Course,
      'name' | 'durationMinutes' | 'type' | 'scheduledAt' | 'accessType' | 'priceKobo'
    >,
  ): Promise<Course | null> {
    const document = await this.courses
      .findOneAndUpdate({ id }, { $set: input }, { new: true, runValidators: true })
      .lean()
      .exec()
    return document ? cleanCourse(document) : null
  }

  async addModule(
    course: Course,
    input: { title: string; content: string },
  ): Promise<CourseModule> {
    const order = await this.modules.countDocuments({ courseId: course.id })
    return clean((await this.modules.create({ ...input, courseId: course.id, order })).toObject())
  }

  async addAttachment(
    course: Course,
    input: Parameters<CourseCatalogRepository['addAttachment']>[1],
  ): Promise<Attachment> {
    return clean(
      (
        await this.attachments.create({
          ...input,
          courseId: course.id,
          courseName: course.name,
          moduleId: null,
        })
      ).toObject(),
    )
  }
}

// A previous application used the same Mongo collection with a different shape
// (`title`, `summary`, `userId`). Only documents created by this catalog have an
// author ID, so use it as the compatibility boundary without modifying legacy data.
const currentCourseFilter = {
  createdByAuthorId: { $exists: true },
}

const clean = <T>(value: unknown): T => {
  const { _id: _id, __v: _version, ...result } = value as Record<string, unknown>
  return result as T
}

const cleanCourse = (value: unknown): Course => {
  const course = clean<Course>(value)
  return {
    ...course,
    accessType: course.accessType ?? 'free',
    priceKobo: course.priceKobo ?? 0,
  }
}
