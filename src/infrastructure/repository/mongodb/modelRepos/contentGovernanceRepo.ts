import mongoose, { type Model } from 'mongoose'
import type { ContentGovernanceRepository } from '../../../../entities/interfaces/contentGovernanceRepository'
import type {
  ContentReview,
  ContentVersion,
  QuestionBankItem,
  ReviewSchedule,
  SecurityPolicy,
} from '../../../../entities/models/ContentGovernance'
import {
  ContentReviewSchema,
  ContentVersionSchema,
  QuestionBankItemSchema,
  ReviewScheduleSchema,
  SecurityPolicySchema,
} from '../models/ContentGovernance'

export class ContentGovernanceRepo implements ContentGovernanceRepository {
  private readonly questions: Model<QuestionBankItem> =
    (mongoose.models.QuestionBankItem as Model<QuestionBankItem> | undefined) ??
    mongoose.model('QuestionBankItem', QuestionBankItemSchema)
  private readonly versions: Model<ContentVersion> =
    (mongoose.models.ContentVersion as Model<ContentVersion> | undefined) ??
    mongoose.model('ContentVersion', ContentVersionSchema)
  private readonly reviews: Model<ContentReview> =
    (mongoose.models.ContentReview as Model<ContentReview> | undefined) ??
    mongoose.model('ContentReview', ContentReviewSchema)
  private readonly schedules: Model<ReviewSchedule> =
    (mongoose.models.ReviewSchedule as Model<ReviewSchedule> | undefined) ??
    mongoose.model('ReviewSchedule', ReviewScheduleSchema)
  private readonly policies: Model<SecurityPolicy> =
    (mongoose.models.SecurityPolicy as Model<SecurityPolicy> | undefined) ??
    mongoose.model('SecurityPolicy', SecurityPolicySchema)

  async createQuestion(
    input: Omit<QuestionBankItem, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<QuestionBankItem> {
    return clean((await this.questions.create(input)).toObject())
  }

  async findQuestion(id: string): Promise<QuestionBankItem | null> {
    const item = await this.questions.findOne({ id }).select('+publishedSnapshot').lean().exec()
    return item ? clean(item) : null
  }

  async listQuestions(authorId?: string): Promise<QuestionBankItem[]> {
    const items = await this.questions
      .find(authorId ? { authorId } : {})
      .sort({ updatedAt: -1 })
      .limit(2000)
      .lean()
      .exec()
    return items.map(clean<QuestionBankItem>)
  }

  async updateQuestion(
    id: string,
    input: Partial<QuestionBankItem>,
  ): Promise<QuestionBankItem | null> {
    const item = await this.questions
      .findOneAndUpdate({ id }, { $set: input }, { new: true, runValidators: true })
      .select('+publishedSnapshot')
      .lean()
      .exec()
    return item ? clean(item) : null
  }

  async createVersion(
    input: Omit<ContentVersion, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ContentVersion> {
    return clean((await this.versions.create(input)).toObject())
  }

  async findVersion(id: string): Promise<ContentVersion | null> {
    const item = await this.versions.findOne({ id }).lean().exec()
    return item ? clean(item) : null
  }

  async listVersions(contentId?: string): Promise<ContentVersion[]> {
    const items = await this.versions
      .find(contentId ? { contentId } : {})
      .sort({ number: -1, createdAt: -1 })
      .limit(2000)
      .lean()
      .exec()
    return items.map(clean<ContentVersion>)
  }

  async updateVersion(id: string, input: Partial<ContentVersion>): Promise<ContentVersion | null> {
    const item = await this.versions
      .findOneAndUpdate({ id }, { $set: input }, { new: true, runValidators: true })
      .lean()
      .exec()
    return item ? clean(item) : null
  }

  async createReview(
    input: Omit<ContentReview, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ContentReview> {
    return clean((await this.reviews.create(input)).toObject())
  }

  async listReviews(contentId?: string): Promise<ContentReview[]> {
    const items = await this.reviews
      .find(contentId ? { contentId } : {})
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean()
      .exec()
    return items.map(clean<ContentReview>)
  }

  async upsertSchedule(
    contentId: string,
    input: Pick<ReviewSchedule, 'reviewAt' | 'reviewerId' | 'status'>,
  ): Promise<ReviewSchedule> {
    const item = await this.schedules
      .findOneAndUpdate(
        { contentId },
        { $set: input, $setOnInsert: { contentId } },
        { upsert: true, new: true, runValidators: true },
      )
      .lean()
      .exec()
    return clean(item)
  }

  async listSchedules(from?: Date, to?: Date): Promise<ReviewSchedule[]> {
    const range =
      from || to
        ? { reviewAt: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } }
        : {}
    const items = await this.schedules.find(range).sort({ reviewAt: 1 }).limit(2000).lean().exec()
    return items.map(clean<ReviewSchedule>)
  }

  async getSecurityPolicy(): Promise<SecurityPolicy | null> {
    const item = await this.policies.findOne({ key: 'mfa' }).lean().exec()
    return item ? clean(item) : null
  }

  async upsertSecurityPolicy(adminId: string): Promise<SecurityPolicy> {
    const item = await this.policies
      .findOneAndUpdate(
        { key: 'mfa' },
        {
          $set: {
            adminsLogin: 'required',
            authorsLogin: 'required',
            studentsLogin: 'optional',
            studentsBeforeEnrollment: 'required',
            updatedByAdminId: adminId,
          },
          $setOnInsert: { key: 'mfa' },
        },
        { upsert: true, new: true, runValidators: true },
      )
      .lean()
      .exec()
    return clean(item)
  }
}

const clean = <T>(value: unknown): T => {
  const { _id: _id, __v: _version, ...result } = value as Record<string, unknown>
  return result as T
}
