import mongoose, { type Model } from 'mongoose'
import type { AssessmentRepository } from '../../../../entities/interfaces/assessmentRepository'
import type { Assessment } from '../../../../entities/models/Assessment'
import type { AssessmentAttempt } from '../../../../entities/models/AssessmentAttempt'
import { AssessmentSchema } from '../models/Assessment'
import { AssessmentAttemptSchema } from '../models/AssessmentAttempt'

export class AssessmentRepo implements AssessmentRepository {
  private attemptIndexesReady?: Promise<void>
  private courseIndexReady?: Promise<void>
  private readonly assessments: Model<Assessment> =
    (mongoose.models.Assessment as Model<Assessment> | undefined) ??
    mongoose.model('Assessment', AssessmentSchema)
  private readonly attempts: Model<AssessmentAttempt> =
    (mongoose.models.AssessmentAttempt as Model<AssessmentAttempt> | undefined) ??
    mongoose.model('AssessmentAttempt', AssessmentAttemptSchema)

  async create(input: Parameters<AssessmentRepository['create']>[0]): Promise<Assessment> {
    await this.prepareCourseIndex()
    return clean<Assessment>((await this.assessments.create(input)).toObject())
  }

  async update(id: string, input: Partial<Assessment>): Promise<Assessment | null> {
    await this.prepareCourseIndex()
    const item = await this.assessments
      .findOneAndUpdate({ id }, { $set: input }, { new: true, runValidators: true })
      .select('+publishedSnapshot')
      .lean()
      .exec()
    return item ? clean<Assessment>(item) : null
  }

  async findById(id: string): Promise<Assessment | null> {
    const item = await this.assessments.findOne({ id }).select('+publishedSnapshot').lean().exec()
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
    const item = await this.assessments
      .findOne({
        courseId,
        $or: [{ kind: 'exam' }, { kind: { $exists: false } }],
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec()
    return item ? clean<Assessment>(item) : null
  }

  async findAll(): Promise<Assessment[]> {
    const items = await this.assessments.find({}).sort({ createdAt: -1 }).limit(1000).lean().exec()
    return items.map(clean<Assessment>)
  }

  async findOpen(now: Date): Promise<Assessment[]> {
    const items = await this.assessments
      .find({
        $or: [{ publicationStatus: 'published' }, { publicationStatus: { $exists: false } }],
      })
      .select('+publishedSnapshot')
      .sort({ opensAt: 1 })
      .limit(200)
      .lean()
      .exec()
    return items.map((item) => publishedAssessment(clean<Assessment>(item)))
  }

  async updateGovernance(id: string, input: Partial<Assessment>): Promise<Assessment | null> {
    const item = await this.assessments
      .findOneAndUpdate({ id }, { $set: input }, { new: true, runValidators: true })
      .lean()
      .exec()
    return item ? clean<Assessment>(item) : null
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

  private async prepareCourseIndex(): Promise<void> {
    if (!this.courseIndexReady) {
      this.courseIndexReady = (async () => {
        try {
          await this.assessments.collection.dropIndex('courseId_1')
        } catch (error) {
          const code = (error as { codeName?: string }).codeName
          if (code !== 'IndexNotFound' && code !== 'NamespaceNotFound') throw error
        }
        await this.assessments.collection.createIndex(
          { courseId: 1 },
          { name: 'assessment_course_1', unique: false },
        )
      })()
    }
    await this.courseIndexReady
  }
}

const clean = <T>(value: unknown): T => {
  const { _id: _id, __v: _version, ...result } = value as Record<string, unknown>
  return result as T
}

const publishedAssessment = (assessment: Assessment): Assessment => {
  const snapshot = assessment.publishedSnapshot as Assessment | null | undefined
  if (!snapshot) return assessment
  return {
    ...snapshot,
    reviewStatus: assessment.reviewStatus,
    publicationStatus: assessment.publicationStatus,
    currentVersionId: assessment.currentVersionId,
    publishedVersionId: assessment.publishedVersionId,
    submittedAt: assessment.submittedAt,
    approvedAt: assessment.approvedAt,
    publishedAt: assessment.publishedAt,
    archivedAt: assessment.archivedAt,
    rejectionReason: assessment.rejectionReason,
  }
}
