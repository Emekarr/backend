import { randomUUID } from 'node:crypto'
import { ApplicationError } from '../../entities/errors/applicationError'
import type { AssessmentRepository } from '../../entities/interfaces/assessmentRepository'
import type { CourseCatalogRepository } from '../../entities/interfaces/courseRepository'
import type { CourseParticipationRepository } from '../../entities/interfaces/courseParticipationRepository'
import type { StudentRepository } from '../../entities/interfaces/studentRepository'
import type { ObjectStorage } from '../../entities/interfaces/storage'
import type { Author } from '../../entities/models/Author'
import type {
  Assessment,
  AssessmentMediaType,
  AssessmentQuestionType,
} from '../../entities/models/Assessment'
import type { AssessmentAnswer } from '../../entities/models/AssessmentAttempt'
import type { Student } from '../../entities/models/Student'
import type { CertificateService } from '../certificate/CertificateService'

export interface CreateAssessmentInput {
  title: string
  description: string
  courseId: string
  durationMinutes: number
  opensAt: Date
  closesAt: Date
  manualReview: boolean
  retrySupported: boolean
  maxAttempts: number
  passingScorePercent: number
  questions: Array<{
    prompt: string
    type: AssessmentQuestionType
    options: Array<{ id: string; label: string }>
    correctOptionIds: string[]
    mediaType?: AssessmentMediaType | null
    mediaUrl?: string | null
    resources?: Array<{ id: string; attachmentPath: string; fileName: string }>
    points: number
  }>
}

export interface SubmitAssessmentInput {
  answers: Array<{
    questionId: string
    selectedOptionIds?: string[]
    text?: string | null
  }>
}

export class AssessmentService {
  constructor(
    private readonly dependencies: {
      assessments: AssessmentRepository
      courses: CourseCatalogRepository
      participation: CourseParticipationRepository
      students: StudentRepository
      certificates: CertificateService
      storage: ObjectStorage
    },
  ) {}

  async create(author: Author, input: CreateAssessmentInput) {
    if (input.opensAt.getTime() >= input.closesAt.getTime())
      throw new ApplicationError(
        'The closing time must be after the opening time',
        'INVALID_ASSESSMENT_WINDOW',
        400,
      )
    if (input.retrySupported && (input.maxAttempts < 2 || input.maxAttempts > 100))
      throw new ApplicationError(
        'Retry-enabled assessments must allow between 2 and 100 total attempts',
        'INVALID_MAX_ATTEMPTS',
        400,
      )
    const attachmentCount = input.questions.filter((question) => question.mediaUrl).length
    if (attachmentCount > 10)
      throw new ApplicationError(
        'An assessment can contain no more than 10 question attachments',
        'ASSESSMENT_ATTACHMENT_LIMIT',
        400,
      )
    if (!input.courseId)
      throw new ApplicationError(
        'An assessment must be linked to a course',
        'COURSE_REQUIRED',
        400,
      )
    const course = await this.dependencies.courses.findById(input.courseId)
    if (!course) throw new ApplicationError('Course not found', 'COURSE_NOT_FOUND', 404)
    if (course.course.createdByAuthorId !== author.id)
      throw new ApplicationError('Only the course author can link an assessment', 'FORBIDDEN', 403)
    if (await this.dependencies.assessments.findByCourseId(input.courseId))
      throw new ApplicationError(
        'This course already has a final assessment',
        'COURSE_ASSESSMENT_EXISTS',
        409,
      )

    for (const question of input.questions) {
      const media = question.mediaUrl?.trim()
      if (
        media?.startsWith('courses/') &&
        (!media.startsWith(`courses/${author.id}/`) ||
          !(await this.dependencies.storage.exists(media)) ||
          !mediaMatchesType(media, question.mediaType ?? null))
      )
        throw new ApplicationError(
          'Question media path is invalid or the upload is incomplete',
          'INVALID_QUESTION_MEDIA',
          400,
        )
      if ((question.resources?.length ?? 0) > 10)
        throw new ApplicationError(
          'A question can contain no more than 10 resources',
          'QUESTION_RESOURCE_LIMIT',
          400,
        )
      for (const resource of question.resources ?? []) {
        if (
          !resource.attachmentPath.startsWith(`courses/${author.id}/`) ||
          !(await this.dependencies.storage.exists(resource.attachmentPath))
        )
          throw new ApplicationError(
            'A question resource upload is missing or does not belong to you',
            'INVALID_QUESTION_RESOURCE',
            400,
          )
      }
    }

    const questions = input.questions.map((question) => {
      if (Boolean(question.mediaType) !== Boolean(question.mediaUrl))
        throw new ApplicationError(
          'Question media type and URL must be provided together',
          'INVALID_QUESTION_MEDIA',
          400,
        )
      const optionIds = new Set(question.options.map((option) => option.id))
      if (
        question.type === 'multiple_choice' &&
        question.correctOptionIds.some((id) => !optionIds.has(id))
      )
        throw new ApplicationError(
          'Every correct answer must match a question option',
          'INVALID_CORRECT_ANSWER',
          400,
        )
      if (question.type === 'multiple_choice' && question.correctOptionIds.length !== 1)
        throw new ApplicationError(
          'Multiple-choice questions must have exactly one correct answer',
          'EXACTLY_ONE_CORRECT_ANSWER_REQUIRED',
          400,
        )
      if (question.type === 'free_text' && question.correctOptionIds.length)
        throw new ApplicationError(
          'Written-response questions cannot include a selected answer',
          'INVALID_CORRECT_ANSWER',
          400,
        )
      return {
        id: randomUUID(),
        prompt: question.prompt.trim(),
        type: question.type,
        options:
          question.type === 'multiple_choice'
            ? question.options.map((option) => ({ ...option, label: option.label.trim() }))
            : [],
        correctOptionIds:
          question.type === 'multiple_choice' ? [...new Set(question.correctOptionIds)] : [],
        mediaType: question.mediaType ?? null,
        mediaUrl: question.mediaUrl?.trim() || null,
        resources: (question.resources ?? []).map((resource) => ({
          id: resource.id,
          attachmentPath: resource.attachmentPath,
          fileName: resource.fileName.trim(),
        })),
        points: question.points,
      }
    })

    const totalScore = questions.reduce((sum, question) => sum + question.points, 0)
    if (totalScore <= 0 || Math.ceil((totalScore * input.passingScorePercent) / 100) > totalScore)
      throw new ApplicationError(
        'The pass mark cannot be higher than the total score achievable from the questions',
        'PASS_MARK_UNACHIEVABLE',
        400,
      )

    const assessment = await this.dependencies.assessments.create({
      title: input.title.trim(),
      description: input.description.trim(),
      authorId: author.id,
      courseId: input.courseId,
      durationMinutes: input.durationMinutes,
      opensAt: input.opensAt,
      closesAt: input.closesAt,
      manualReview: input.manualReview,
      retrySupported: input.retrySupported,
      maxAttempts: input.retrySupported ? input.maxAttempts : 1,
      passingScorePercent: input.passingScorePercent,
      questions,
    })
    if (assessment.courseId)
      await this.dependencies.participation.resetCourseCompletion(assessment.courseId)
    return assessment
  }

  async listOwned(author: Author) {
    const assessments = await this.dependencies.assessments.findByAuthor(author.id)
    return Promise.all(
      assessments.map(async (assessment) => ({
        ...assessmentPolicy(assessment),
        availability: availabilityStatus(assessment),
        submissionCount: (await this.dependencies.assessments.listAttempts(assessment.id)).filter(
          (attempt) => attempt.status !== 'in_progress',
        ).length,
      })),
    )
  }

  async getOwned(author: Author, assessmentId: string) {
    return this.ownedAssessment(author, assessmentId)
  }

  async listSubmissions(author: Author, assessmentId: string) {
    const assessment = await this.ownedAssessment(author, assessmentId)
    const attempts = await this.dependencies.assessments.listAttempts(assessmentId)
    return Promise.all(
      attempts
        .filter((attempt) => attempt.status !== 'in_progress')
        .map(async (attempt) => {
          const student = await this.dependencies.students.findById(attempt.studentId)
          return {
            ...attempt,
            student: student
              ? {
                  id: student.id,
                  firstName: student.firstName,
                  lastName: student.lastName,
                  email: student.email,
                }
              : { id: attempt.studentId, firstName: 'Deleted', lastName: 'student', email: '' },
            assessmentTitle: assessment.title,
          }
        }),
    )
  }

  async review(
    author: Author,
    assessmentId: string,
    attemptId: string,
    grades: Array<{ questionId: string; awardedPoints: number; feedback?: string | null }>,
  ) {
    const assessment = await this.ownedAssessment(author, assessmentId)
    const attempt = await this.dependencies.assessments.findAttempt(attemptId)
    if (!attempt || attempt.assessmentId !== assessmentId)
      throw new ApplicationError('Submission not found', 'SUBMISSION_NOT_FOUND', 404)
    if (attempt.status !== 'pending_review')
      throw new ApplicationError(
        'This submission is not awaiting review',
        'SUBMISSION_NOT_REVIEWABLE',
        409,
      )
    const gradeByQuestion = new Map(grades.map((grade) => [grade.questionId, grade]))
    const answers = attempt.answers.map((answer) => {
      const question = assessment.questions.find((item) => item.id === answer.questionId)
      const grade = gradeByQuestion.get(answer.questionId)
      if (!question || !grade)
        throw new ApplicationError('Every response must receive a grade', 'INCOMPLETE_REVIEW', 400)
      if (grade.awardedPoints > question.points)
        throw new ApplicationError(
          `Awarded points for “${question.prompt}” exceed the question maximum`,
          'INVALID_GRADE',
          400,
        )
      return {
        ...answer,
        awardedPoints: grade.awardedPoints,
        feedback: grade.feedback?.trim() || null,
      }
    })
    const score = answers.reduce((sum, answer) => sum + (answer.awardedPoints ?? 0), 0)
    const passed = isPassing(assessment, score, attempt.maxScore)
    const result = await this.dependencies.assessments.reviewAttempt(attemptId, {
      answers,
      status: 'graded',
      score,
      passed,
      reviewedAt: new Date(),
      reviewedByAuthorId: author.id,
    })
    if (passed && assessment.courseId) {
      const student = await this.dependencies.students.findById(attempt.studentId)
      if (student) await this.completeCourseAfterPass(student, assessment)
    }
    return result
  }

  async listAvailable(student: Student) {
    const assessments = await this.dependencies.assessments.findOpen(new Date())
    const visible = await Promise.all(
      assessments.map(async (assessment) => {
        if (assessment.courseId) {
          const enrollment = await this.dependencies.participation.findEnrollment(
            student.id,
            assessment.courseId,
          )
          if (!enrollment) return null
        }
        let attempts = await this.dependencies.assessments.listAttemptsForStudent(
          assessment.id,
          student.id,
        )
        let attempt = attempts.at(-1) ?? null
        if (availabilityStatus(assessment) === 'closed' && !attempt) return null
        if (attempt?.status === 'in_progress' && attempt.expiresAt.getTime() <= Date.now()) {
          attempt = await this.submit(student, attempt.id, { answers: [] })
          attempts = [...attempts.slice(0, -1), attempt]
        }
        return {
          ...(await this.publicAssessment(assessment)),
          attempt,
          attemptHistory: attempts.map(attemptSummary),
          attemptsRemaining: Math.max(0, maxAttempts(assessment) - attempts.length),
        }
      }),
    )
    return visible.filter((item) => item !== null)
  }

  async getAvailable(student: Student, assessmentId: string) {
    const assessment = await this.availableAssessment(assessmentId)
    await this.assertCourseEligibility(student, assessment)
    let attempts = await this.dependencies.assessments.listAttemptsForStudent(
      assessment.id,
      student.id,
    )
    let attempt = attempts.at(-1) ?? null
    if (attempt?.status === 'in_progress' && attempt.expiresAt.getTime() <= Date.now()) {
      attempt = await this.submit(student, attempt.id, { answers: [] })
      attempts = [...attempts.slice(0, -1), attempt]
    }
    return {
      ...(await this.publicAssessment(assessment)),
      attempt,
      attemptHistory: attempts.map(attemptSummary),
      attemptsRemaining: Math.max(0, maxAttempts(assessment) - attempts.length),
    }
  }

  async start(student: Student, assessmentId: string) {
    const assessment = await this.availableAssessment(assessmentId)
    await this.assertCourseEligibility(student, assessment)
    let attempts = await this.dependencies.assessments.listAttemptsForStudent(
      assessment.id,
      student.id,
    )
    let latest = attempts.at(-1)
    if (latest?.status === 'in_progress' && latest.expiresAt.getTime() <= Date.now()) {
      latest = await this.submit(student, latest.id, { answers: [] })
      attempts = [...attempts.slice(0, -1), latest]
    }
    if (latest?.status === 'in_progress')
      return { assessment: await this.publicAssessment(assessment), attempt: latest }
    if (latest?.status === 'pending_review')
      throw new ApplicationError(
        'Wait for the author to review your current attempt before retrying',
        'ASSESSMENT_REVIEW_PENDING',
        409,
      )
    if (latest?.passed)
      throw new ApplicationError(
        'You have already passed this assessment',
        'ASSESSMENT_PASSED',
        409,
      )
    if (attempts.length >= maxAttempts(assessment))
      throw new ApplicationError(
        'You have used all allowed assessment attempts',
        'ASSESSMENT_ATTEMPTS_EXHAUSTED',
        409,
      )
    const startedAt = new Date()
    const expiresAt = new Date(
      Math.min(
        assessment.closesAt.getTime(),
        startedAt.getTime() + assessment.durationMinutes * 60_000,
      ),
    )
    const attempt = await this.dependencies.assessments.createAttempt({
      assessmentId: assessment.id,
      studentId: student.id,
      courseId: assessment.courseId,
      attemptNumber: attempts.length + 1,
      status: 'in_progress',
      startedAt,
      submittedAt: null,
      expiresAt,
      score: null,
      maxScore: assessment.questions.reduce((sum, question) => sum + question.points, 0),
      passed: null,
      answers: [],
      reviewedAt: null,
      reviewedByAuthorId: null,
    })
    return { assessment: await this.publicAssessment(assessment), attempt }
  }

  async submit(student: Student, attemptId: string, input: SubmitAssessmentInput) {
    const attempt = await this.dependencies.assessments.findAttempt(attemptId)
    if (!attempt || attempt.studentId !== student.id)
      throw new ApplicationError('Assessment attempt not found', 'ATTEMPT_NOT_FOUND', 404)
    if (attempt.status !== 'in_progress')
      throw new ApplicationError('This assessment was already submitted', 'ALREADY_SUBMITTED', 409)
    const expired = attempt.expiresAt.getTime() <= Date.now()
    const assessment = await this.dependencies.assessments.findById(attempt.assessmentId)
    if (!assessment) throw new ApplicationError('Assessment not found', 'ASSESSMENT_NOT_FOUND', 404)

    const submitted = new Map(
      (expired ? [] : input.answers).map((answer) => [answer.questionId, answer]),
    )
    const answers: AssessmentAnswer[] = assessment.questions.map((question) => {
      const answer = submitted.get(question.id)
      const selectedOptionIds = [...new Set(answer?.selectedOptionIds ?? [])]
      if (selectedOptionIds.some((id) => !question.options.some((option) => option.id === id)))
        throw new ApplicationError('An answer contains an invalid option', 'INVALID_ANSWER', 400)
      const automaticallyMarked = question.type === 'multiple_choice' && !assessment.manualReview
      const awardedPoints = automaticallyMarked
        ? sameSet(selectedOptionIds, question.correctOptionIds)
          ? question.points
          : 0
        : null
      return {
        questionId: question.id,
        selectedOptionIds: question.type === 'multiple_choice' ? selectedOptionIds : [],
        text: question.type === 'free_text' ? answer?.text?.trim() || null : null,
        awardedPoints,
        feedback: null,
      }
    })
    const needsReview =
      assessment.manualReview || assessment.questions.some((q) => q.type === 'free_text')
    const score = needsReview
      ? null
      : answers.reduce((sum, answer) => sum + (answer.awardedPoints ?? 0), 0)
    const passed = score === null ? null : isPassing(assessment, score, attempt.maxScore)
    const result = await this.dependencies.assessments.submitAttempt(attempt.id, {
      answers,
      status: needsReview ? 'pending_review' : 'graded',
      submittedAt: new Date(),
      score,
      passed,
    })
    if (passed && assessment.courseId) await this.completeCourseAfterPass(student, assessment)
    return result
  }

  async getAttempt(student: Student, attemptId: string) {
    const attempt = await this.dependencies.assessments.findAttempt(attemptId)
    if (!attempt || attempt.studentId !== student.id)
      throw new ApplicationError('Assessment attempt not found', 'ATTEMPT_NOT_FOUND', 404)
    const assessment = await this.dependencies.assessments.findById(attempt.assessmentId)
    if (!assessment) throw new ApplicationError('Assessment not found', 'ASSESSMENT_NOT_FOUND', 404)
    const attempts = await this.dependencies.assessments.listAttemptsForStudent(
      assessment.id,
      student.id,
    )
    return {
      assessment: await this.publicAssessment(assessment),
      attempt,
      attemptHistory: attempts.map(attemptSummary),
      attemptsRemaining: Math.max(0, maxAttempts(assessment) - attempts.length),
    }
  }

  private async ownedAssessment(author: Author, assessmentId: string): Promise<Assessment> {
    const assessment = await this.dependencies.assessments.findById(assessmentId)
    if (!assessment) throw new ApplicationError('Assessment not found', 'ASSESSMENT_NOT_FOUND', 404)
    if (assessment.authorId !== author.id)
      throw new ApplicationError('Only the assessment author can access it', 'FORBIDDEN', 403)
    return assessmentPolicy(assessment)
  }

  private async availableAssessment(assessmentId: string): Promise<Assessment> {
    const assessment = await this.dependencies.assessments.findById(assessmentId)
    if (!assessment) throw new ApplicationError('Assessment not found', 'ASSESSMENT_NOT_FOUND', 404)
    const now = Date.now()
    if (now < assessment.opensAt.getTime())
      throw new ApplicationError(
        `Assessment opens on ${assessment.opensAt.toISOString()}`,
        'ASSESSMENT_NOT_OPEN',
        403,
      )
    if (now > assessment.closesAt.getTime())
      throw new ApplicationError('Assessment is closed', 'ASSESSMENT_CLOSED', 403)
    return assessment
  }

  private async assertCourseEligibility(student: Student, assessment: Assessment): Promise<void> {
    if (!assessment.courseId) return
    const [course, progress] = await Promise.all([
      this.dependencies.courses.findById(assessment.courseId),
      this.dependencies.participation.findProgress(student.id, assessment.courseId),
    ])
    if (!course || !progress)
      throw new ApplicationError(
        'Enrollment in the linked course is required',
        'ENROLLMENT_REQUIRED',
        403,
      )
    const completed = new Set(progress.completedModules.map((item) => item.moduleId))
    if (course.modules.some((module) => !completed.has(module.id)))
      throw new ApplicationError(
        'Complete every course module before starting the final assessment',
        'COURSE_MODULES_INCOMPLETE',
        409,
      )
  }

  private async publicAssessment(assessment: Assessment) {
    return {
      ...assessment,
      retrySupported: assessment.retrySupported ?? false,
      maxAttempts: maxAttempts(assessment),
      passingScorePercent: assessment.passingScorePercent ?? 0,
      availability: availabilityStatus(assessment),
      questions: await Promise.all(
        assessment.questions.map(async ({ correctOptionIds: _answers, ...question }) => ({
          ...question,
          mediaUrl: question.mediaUrl?.startsWith('courses/')
            ? (await this.dependencies.storage.createSignedView(question.mediaUrl)).viewUrl
            : question.mediaUrl,
          resources: await Promise.all(
            question.resources.map(async (resource) => ({
              id: resource.id,
              fileName: resource.fileName,
              url: resource.attachmentPath.startsWith('courses/')
                ? (await this.dependencies.storage.createSignedView(resource.attachmentPath)).viewUrl
                : resource.attachmentPath,
            })),
          ),
        })),
      ),
    }
  }

  private async completeCourseAfterPass(student: Student, assessment: Assessment): Promise<void> {
    if (!assessment.courseId) return
    const [enrollment, course] = await Promise.all([
      this.dependencies.participation.findEnrollment(student.id, assessment.courseId),
      this.dependencies.courses.findById(assessment.courseId),
    ])
    if (!enrollment || !course) return
    const completedAt = enrollment.completedAt ?? new Date()
    if (!enrollment.completedAt)
      await this.dependencies.participation.markEnrollmentCompleted(enrollment.id, completedAt)
    await this.dependencies.certificates.issue(student, course.course, completedAt)
  }
}

const sameSet = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value) => right.includes(value))

const availabilityStatus = (assessment: Assessment): 'scheduled' | 'open' | 'closed' => {
  const now = Date.now()
  if (now < assessment.opensAt.getTime()) return 'scheduled'
  if (now > assessment.closesAt.getTime()) return 'closed'
  return 'open'
}

const maxAttempts = (assessment: Assessment) =>
  assessment.retrySupported ? Math.max(2, Math.min(100, assessment.maxAttempts ?? 2)) : 1

const assessmentPolicy = (assessment: Assessment): Assessment => ({
  ...assessment,
  retrySupported: assessment.retrySupported ?? false,
  maxAttempts: maxAttempts(assessment),
  passingScorePercent: assessment.passingScorePercent ?? 0,
})

const isPassing = (assessment: Assessment, score: number, maximum: number) =>
  maximum > 0 && (score / maximum) * 100 >= (assessment.passingScorePercent ?? 0)

const attemptSummary = (
  attempt: import('../../entities/models/AssessmentAttempt').AssessmentAttempt,
) => ({
  id: attempt.id,
  attemptNumber: attempt.attemptNumber ?? 1,
  status: attempt.status,
  score: attempt.score,
  maxScore: attempt.maxScore,
  passed: attempt.passed,
  startedAt: attempt.startedAt,
  submittedAt: attempt.submittedAt,
})

const mediaMatchesType = (path: string, type: AssessmentMediaType | null) => {
  if (type === 'image') return /\.(jpg|png)$/i.test(path)
  if (type === 'video') return /\.mp4$/i.test(path)
  if (type === 'audio') return /\.mp3$/i.test(path)
  return false
}
