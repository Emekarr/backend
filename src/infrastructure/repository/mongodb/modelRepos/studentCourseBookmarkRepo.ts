import mongoose, { type Model } from 'mongoose'
import type { StudentCourseBookmarkRepository } from '../../../../entities/interfaces/studentCourseBookmarkRepository'
import type {
  CreateStudentCourseBookmark,
  StudentCourseBookmark,
} from '../../../../entities/models/StudentCourseBookmark'
import { StudentCourseBookmarkSchema } from '../models/StudentCourseBookmark'

export class StudentCourseBookmarkRepo implements StudentCourseBookmarkRepository {
  private readonly bookmarks: Model<StudentCourseBookmark> =
    (mongoose.models.StudentCourseBookmark as Model<StudentCourseBookmark> | undefined) ??
    mongoose.model('StudentCourseBookmark', StudentCourseBookmarkSchema)

  async find(studentId: string, courseId: string): Promise<StudentCourseBookmark | null> {
    const document = await this.bookmarks.findOne({ studentId, courseId }).lean().exec()
    return document ? clean(document) : null
  }

  async listForStudent(studentId: string): Promise<StudentCourseBookmark[]> {
    const documents = await this.bookmarks
      .find({ studentId, enabled: true })
      .sort({ scheduledAt: 1 })
      .lean()
      .exec()
    return documents.map(clean)
  }

  async save(input: CreateStudentCourseBookmark): Promise<StudentCourseBookmark> {
    const document = await this.bookmarks
      .findOneAndUpdate(
        { studentId: input.studentId, courseId: input.courseId },
        { $set: input },
        { new: true, upsert: true, runValidators: true },
      )
      .lean()
      .exec()
    return clean(document)
  }

  async markDelivered(
    studentId: string,
    courseId: string,
    leadMinutes: 30 | 10,
    deliveredAt: Date,
  ): Promise<void> {
    const deliveredField = leadMinutes === 30 ? 'delivered30At' : 'delivered10At'
    const errorField = leadMinutes === 30 ? 'delivery30Error' : 'delivery10Error'
    await this.bookmarks
      .updateOne(
        { studentId, courseId, enabled: true },
        { $set: { [deliveredField]: deliveredAt, [errorField]: null } },
      )
      .exec()
  }

  async markDeliveryFailed(
    studentId: string,
    courseId: string,
    leadMinutes: 30 | 10,
    message: string,
  ): Promise<void> {
    const field = leadMinutes === 30 ? 'delivery30Error' : 'delivery10Error'
    await this.bookmarks
      .updateOne(
        { studentId, courseId, enabled: true },
        { $set: { [field]: message.slice(0, 1_000) } },
      )
      .exec()
  }
}

const clean = (value: unknown): StudentCourseBookmark => {
  const { _id: _id, __v: _version, ...result } = value as Record<string, unknown>
  return result as unknown as StudentCourseBookmark
}
