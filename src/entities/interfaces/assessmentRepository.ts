import type { Assessment, CreateAssessment } from '../models/Assessment'
import type { AssessmentAttempt, CreateAssessmentAttempt } from '../models/AssessmentAttempt'

export interface AssessmentRepository {
  create(input: CreateAssessment): Promise<Assessment>
  findById(id: string): Promise<Assessment | null>
  findByAuthor(authorId: string): Promise<Assessment[]>
  findByCourseId(courseId: string): Promise<Assessment | null>
  findOpen(now: Date): Promise<Assessment[]>
  createAttempt(input: CreateAssessmentAttempt): Promise<AssessmentAttempt>
  findAttempt(id: string): Promise<AssessmentAttempt | null>
  findAttemptForStudent(assessmentId: string, studentId: string): Promise<AssessmentAttempt | null>
  listAttemptsForStudent(assessmentId: string, studentId: string): Promise<AssessmentAttempt[]>
  listAttempts(assessmentId: string): Promise<AssessmentAttempt[]>
  submitAttempt(
    id: string,
    input: Pick<AssessmentAttempt, 'answers' | 'status' | 'submittedAt' | 'score' | 'passed'>,
  ): Promise<AssessmentAttempt>
  reviewAttempt(
    id: string,
    input: Pick<
      AssessmentAttempt,
      'answers' | 'status' | 'score' | 'passed' | 'reviewedAt' | 'reviewedByAuthorId'
    >,
  ): Promise<AssessmentAttempt>
}
