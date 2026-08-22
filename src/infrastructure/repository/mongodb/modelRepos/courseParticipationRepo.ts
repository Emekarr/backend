import mongoose, { type Model } from 'mongoose'
import type {
  CourseParticipationRepository,
  EnrollmentProgress,
  ParticipantProgress,
} from '../../../../entities/interfaces/courseParticipationRepository'
import type { CourseEnrollment } from '../../../../entities/models/CourseEnrollment'
import type { ModuleProgress } from '../../../../entities/models/ModuleProgress'
import type { AuthorRating } from '../../../../entities/models/AuthorRating'
import type { Student } from '../../../../entities/models/Student'
import { generateID } from '../../../identifiers/generators'
import { CourseEnrollmentSchema } from '../models/CourseEnrollment'
import { ModuleProgressSchema } from '../models/ModuleProgress'
import { StudentSchema } from '../models/Student'
import { AuthorRatingSchema } from '../models/AuthorRating'

export class CourseParticipationRepo implements CourseParticipationRepository {
  private readonly enrollments: Model<CourseEnrollment> =
    (mongoose.models.CourseEnrollment as Model<CourseEnrollment> | undefined) ??
    mongoose.model('CourseEnrollment', CourseEnrollmentSchema)
  private readonly progress: Model<ModuleProgress> =
    (mongoose.models.ModuleProgress as Model<ModuleProgress> | undefined) ??
    mongoose.model('ModuleProgress', ModuleProgressSchema)
  private readonly students: Model<Student> =
    (mongoose.models.Student as Model<Student> | undefined) ??
    mongoose.model('Student', StudentSchema)
  private readonly ratings: Model<AuthorRating> =
    (mongoose.models.AuthorRating as Model<AuthorRating> | undefined) ??
    mongoose.model('AuthorRating', AuthorRatingSchema)

  async enroll(input: {
    courseId: string
    studentId: string
    source: CourseEnrollment['source']
    invitationId: string
    paymentReference: string | null
    enrolledAt: Date
  }): Promise<CourseEnrollment> {
    const document = await this.enrollments
      .findOneAndUpdate(
        { courseId: input.courseId, studentId: input.studentId },
        {
          $setOnInsert: {
            id: generateID(),
            ...input,
            completedAt: null,
          },
        },
        { upsert: true, new: true, runValidators: true },
      )
      .lean()
      .exec()
    return cleanEnrollment(document)
  }

  async findEnrollment(studentId: string, courseId: string): Promise<CourseEnrollment | null> {
    const document = await this.enrollments.findOne({ studentId, courseId }).lean().exec()
    return document ? cleanEnrollment(document) : null
  }

  async findProgress(studentId: string, courseId: string): Promise<EnrollmentProgress | null> {
    const enrollment = await this.findEnrollment(studentId, courseId)
    if (!enrollment) return null
    const progress = await this.progress
      .find({ enrollmentId: enrollment.id })
      .sort({ completedAt: 1 })
      .lean()
      .exec()
    return { enrollment, completedModules: progress.map(clean<ModuleProgress>) }
  }

  async completeModule(input: {
    enrollmentId: string
    courseId: string
    moduleId: string
    studentId: string
    completedAt: Date
  }): Promise<ModuleProgress> {
    const document = await this.progress
      .findOneAndUpdate(
        { enrollmentId: input.enrollmentId, moduleId: input.moduleId },
        { $setOnInsert: { id: generateID(), ...input } },
        { upsert: true, new: true, runValidators: true },
      )
      .lean()
      .exec()
    return clean<ModuleProgress>(document)
  }

  async markEnrollmentCompleted(enrollmentId: string, completedAt: Date): Promise<void> {
    await this.enrollments.updateOne(
      { id: enrollmentId, completedAt: null },
      { $set: { completedAt } },
    )
  }

  async resetCourseCompletion(courseId: string): Promise<void> {
    await this.enrollments.updateMany({ courseId }, { $set: { completedAt: null } })
  }

  async resetCourseProgress(courseId: string): Promise<void> {
    const [enrollments, progress] = await Promise.all([
      this.enrollments.find({ courseId }).select('id completedAt').lean().exec(),
      this.progress.find({ courseId }).select('enrollmentId moduleId completedAt').lean().exec(),
    ])
    if (!enrollments.length) return

    const completedByEnrollment = new Map<string, string[]>()
    for (const item of progress) {
      const completed = completedByEnrollment.get(item.enrollmentId) ?? []
      completed.push(item.moduleId)
      completedByEnrollment.set(item.enrollmentId, completed)
    }
    const resetAt = new Date()
    await this.enrollments.bulkWrite(
      enrollments.map((enrollment) => ({
        updateOne: {
          filter: { id: enrollment.id },
          update: {
            $set: { completedAt: null },
            $push: {
              progressResetHistory: {
                $each: [
                  {
                    resetAt,
                    reason: 'course_modules_changed' as const,
                    completedModuleIds: completedByEnrollment.get(enrollment.id) ?? [],
                    completedAt: enrollment.completedAt ?? null,
                  },
                ],
                $slice: -20,
              },
            },
          },
        },
      })),
    )
    await this.progress.deleteMany({ courseId }).exec()
  }

  async upsertAuthorRating(input: {
    authorId: string
    courseId: string
    studentId: string
    rating: number
  }): Promise<number> {
    const document = await this.ratings
      .findOneAndUpdate(
        { studentId: input.studentId, courseId: input.courseId },
        {
          $set: { authorId: input.authorId, rating: input.rating },
          $setOnInsert: { id: generateID(), courseId: input.courseId, studentId: input.studentId },
        },
        { upsert: true, new: true, runValidators: true },
      )
      .lean()
      .exec()
    return document.rating
  }

  async findAuthorRating(studentId: string, courseId: string): Promise<number | null> {
    const document = await this.ratings
      .findOne({ studentId, courseId })
      .select('rating')
      .lean()
      .exec()
    return document?.rating ?? null
  }

  async getAuthorRatingSummary(authorId: string): Promise<{ average: number; count: number }> {
    const [summary] = await this.ratings
      .aggregate<{ average: number; count: number }>([
        { $match: { authorId } },
        { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
      ])
      .exec()
    return { average: summary?.average ?? 0, count: summary?.count ?? 0 }
  }

  async listForStudent(studentId: string): Promise<EnrollmentProgress[]> {
    const enrollments = await this.enrollments
      .find({ studentId })
      .sort({ enrolledAt: -1 })
      .limit(500)
      .lean()
      .exec()
    return Promise.all(
      enrollments.map(async (item) => {
        const enrollment = cleanEnrollment(item)
        const progress = await this.progress.find({ enrollmentId: enrollment.id }).lean().exec()
        return { enrollment, completedModules: progress.map(clean<ModuleProgress>) }
      }),
    )
  }

  async listParticipants(courseId: string): Promise<ParticipantProgress[]> {
    const enrollments = await this.enrollments
      .find({ courseId })
      .sort({ enrolledAt: -1 })
      .limit(1000)
      .lean()
      .exec()
    return Promise.all(
      enrollments.map(async (item) => {
        const enrollment = cleanEnrollment(item)
        const [student, progress] = await Promise.all([
          this.students
            .findOne({ id: enrollment.studentId })
            .select('id firstName lastName email')
            .lean()
            .exec(),
          this.progress.find({ enrollmentId: enrollment.id }).lean().exec(),
        ])
        return {
          enrollment,
          completedModules: progress.map(clean<ModuleProgress>),
          student: student
            ? {
                id: student.id,
                firstName: student.firstName,
                lastName: student.lastName,
                email: student.email,
              }
            : { id: enrollment.studentId, firstName: 'Deleted', lastName: 'student', email: '' },
        }
      }),
    )
  }
}

const clean = <T>(value: unknown): T => {
  const { _id: _id, __v: _version, ...result } = value as Record<string, unknown>
  return result as T
}

const cleanEnrollment = (value: unknown): CourseEnrollment => {
  const enrollment = clean<CourseEnrollment>(value)
  return {
    ...enrollment,
    source: enrollment.source ?? 'invitation',
    paymentReference: enrollment.paymentReference ?? null,
    progressResetHistory: enrollment.progressResetHistory ?? [],
  }
}
