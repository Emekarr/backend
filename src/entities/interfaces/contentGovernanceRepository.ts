import type {
  ContentReview,
  ContentVersion,
  QuestionBankItem,
  ReviewSchedule,
  SecurityPolicy,
} from '../models/ContentGovernance'

export interface ContentGovernanceRepository {
  createQuestion(
    input: Omit<QuestionBankItem, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<QuestionBankItem>
  findQuestion(id: string): Promise<QuestionBankItem | null>
  listQuestions(authorId?: string): Promise<QuestionBankItem[]>
  updateQuestion(id: string, input: Partial<QuestionBankItem>): Promise<QuestionBankItem | null>
  createVersion(
    input: Omit<ContentVersion, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ContentVersion>
  findVersion(id: string): Promise<ContentVersion | null>
  listVersions(contentId?: string): Promise<ContentVersion[]>
  updateVersion(id: string, input: Partial<ContentVersion>): Promise<ContentVersion | null>
  createReview(input: Omit<ContentReview, 'id' | 'createdAt' | 'updatedAt'>): Promise<ContentReview>
  listReviews(contentId?: string): Promise<ContentReview[]>
  upsertSchedule(
    contentId: string,
    input: Pick<ReviewSchedule, 'reviewAt' | 'reviewerId' | 'status'>,
  ): Promise<ReviewSchedule>
  listSchedules(from?: Date, to?: Date): Promise<ReviewSchedule[]>
  getSecurityPolicy(): Promise<SecurityPolicy | null>
  upsertSecurityPolicy(adminId: string): Promise<SecurityPolicy>
}
