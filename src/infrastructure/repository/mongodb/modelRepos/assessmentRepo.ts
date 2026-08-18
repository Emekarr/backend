import mongoose, { type Model } from 'mongoose'
import type { AssessmentRepository } from '../../../../entities/interfaces/assessmentRepository'
import type { Assessment } from '../../../../entities/models/Assessment'
import type { AssessmentAttempt } from '../../../../entities/models/AssessmentAttempt'
import { AssessmentSchema } from '../models/Assessment'
import { AssessmentAttemptSchema } from '../models/AssessmentAttempt'

export class AssessmentRepo implements AssessmentRepository {
  private attemptIndexesReady?: Promise<void>
  private readonly assessments: Model<Assessment> =
    (mongoose.models.Assessment as Model<Assessment> | undefined) ??
    mongoose.model('Assessment', AssessmentSchema)
  private readonly attempts: Model<AssessmentAttempt> =
    (mongoose.models.AssessmentAttempt as Model<AssessmentAttempt> | undefined) ??
    mongoose.model('AssessmentAttempt', AssessmentAttemptSchema)

  async create(input: Parameters<AssessmentRepository['create']>[0]): Promise<Assessment> {
    return clean<Assessment>((await this.assessments.create(input)).toObject())
  }

  async findById(id: string): Promise<Assessment | null> {
    const item = await this.assessments.findOne({ id }).lean().exec()
    return item ? clean<Assessment>(item) : null
  }

  async findByAuthor(authorId: string): Promise<Assessment[]> {
    const items = await this.assessments
      .find({ authorId })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean()
      .exec()
    return items.map(clean<Assessment>)
  }

  async findByCourseId(courseId: string): Promise<Assessment | null> {
    const item = await this.assessments.findOne({ courseId }).lean().exec()
    return item ? clean<Assessment>(item) : null
  }

  async findOpen(now: Date): Promise<Assessment[]> {
    const items = await this.assessments.find({}).sort({ opensAt: 1 }).limit(200).lean().exec()
    return items.map(clean<Assessment>)
  }

  async createAttempt(
    input: Parameters<AssessmentRepository['createAttempt']>[0],
  ): Promise<AssessmentAttempt> {
    await this.prepareAttemptIndexes()
    return clean<AssessmentAttempt>((await this.attempts.create(input)).toObject())
  }

  async findAttempt(id: string): Promise<AssessmentAttempt | null> {
    const item = await this.attempts.findOne({ id }).lean().exec()
    return item ? clean<AssessmentAttempt>(item) : null
  }

  async findAttemptForStudent(
    assessmentId: string,
    studentId: string,
  ): Promise<AssessmentAttempt | null> {
    const item = await this.attempts
      .findOne({ assessmentId, studentId })
      .sort({ attemptNumber: -1, startedAt: -1 })
      .lean()
      .exec()
    return item ? clean<AssessmentAttempt>(item) : null
  }

  async listAttemptsForStudent(
    assessmentId: string,
    studentId: string,
  ): Promise<AssessmentAttempt[]> {
    const items = await this.attempts
      .find({ assessmentId, studentId })
      .sort({ attemptNumber: 1, startedAt: 1 })
      .limit(100)
      .lean()
      .exec()
    return items.map(clean<AssessmentAttempt>)
  }

  async listAttempts(assessmentId: string): Promise<AssessmentAttempt[]> {
    const items = await this.attempts
      .find({ assessmentId })
      .sort({ submittedAt: -1, startedAt: -1 })
      .limit(1000)
      .lean()
      .exec()
    return items.map(clean<AssessmentAttempt>)
  }

  async submitAttempt(
    id: string,
    input: Parameters<AssessmentRepository['submitAttempt']>[1],
  ): Promise<AssessmentAttempt> {
    const item = await this.attempts
      .findOneAndUpdate({ id, status: 'in_progress' }, { $set: input }, { new: true })
      .lean()
      .exec()
    if (!item) throw new Error('Assessment attempt is no longer open')
    return clean<AssessmentAttempt>(item)
  }

  async reviewAttempt(
    id: string,
    input: Parameters<AssessmentRepository['reviewAttempt']>[1],
  ): Promise<AssessmentAttempt> {
    const item = await this.attempts
      .findOneAndUpdate({ id, status: 'pending_review' }, { $set: input }, { new: true })
      .lean()
      .exec()
    if (!item) throw new Error('Assessment attempt is not awaiting review')
    return clean<AssessmentAttempt>(item)
  }

  private async prepareAttemptIndexes(): Promise<void> {
    if (!this.attemptIndexesReady) {
      this.attemptIndexesReady = (async () => {
        try {
          await this.attempts.collection.dropIndex('assessmentId_1_studentId_1')
        } catch (error) {
          const code = (error as { codeName?: string }).codeName
          if (code !== 'IndexNotFound' && code !== 'NamespaceNotFound') throw error
        }
        await this.attempts.collection.createIndex(
          { assessmentId: 1, studentId: 1, attemptNumber: 1 },
          { unique: true, name: 'assessmentId_1_studentId_1_attemptNumber_1' },
        )
      })()
    }
    await this.attemptIndexesReady
  }
}

const clean = <T>(value: unknown): T => {
  const { _id: _id, __v: _version, ...result } = value as Record<string, unknown>
  return result as T
}
