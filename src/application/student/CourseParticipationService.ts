import { ApplicationError } from '../../entities/errors/applicationError'
import type { CourseParticipationRepository } from '../../entities/interfaces/courseParticipationRepository'
import type { CourseCatalogRepository } from '../../entities/interfaces/courseRepository'
import type { AssessmentRepository } from '../../entities/interfaces/assessmentRepository'
import type { AuthorRepository } from '../../entities/interfaces/authorRepository'
import type { CertificateService } from '../certificate/CertificateService'
import type { Author } from '../../entities/models/Author'
import type { Student } from '../../entities/models/Student'
import type { CourseEnrollment } from '../../entities/models/CourseEnrollment'
import { generateID } from '../../infrastructure/identifiers/generators'

export class CourseParticipationService {
  constructor(
    private readonly dependencies: {
      courses: CourseCatalogRepository
      authors: AuthorRepository
      participation: CourseParticipationRepository
      assessments: AssessmentRepository
      certificates: CertificateService
    },
  ) {}

  async enroll(student: Student, courseId: string) {
    if (!student.twoFactorEnabled)
      throw new ApplicationError(
        'Two-factor setup is required before enrollment',
        'TWO_FACTOR_SETUP_REQUIRED',
        403,
      )
    const course = await this.availableCourse(courseId)
    if (course.course.accessType === 'paid')
      throw new ApplicationError(
        'Payment is required before enrollment',
        'COURSE_PAYMENT_REQUIRED',
        402,
      )
    const enrollment = await this.dependencies.participation.enroll({
      courseId: course.course.id,
      studentId: student.id,
      source: 'free',
      invitationId: `FREE-${generateID()}`,
      paymentReference: null,
      enrolledAt: new Date(),
    })
    const assessment = await this.dependencies.assessments.findByCourseId(courseId)
    if (!course.modules.length && !assessment && !enrollment.completedAt) {
      const completedAt = new Date()
      await this.dependencies.participation.markEnrollmentCompleted(enrollment.id, completedAt)
      if (course.course.certificateOnCompletion)
        await this.dependencies.certificates.issue(student, course.course, completedAt)
    }
    return this.courseView(student, courseId, enrollment)
  }

  async courseView(student: Student, courseId: string, knownEnrollment?: CourseEnrollment) {
    const aggregate = await this.availableCourse(courseId)
    const enrollment =
      knownEnrollment ??
      (await this.dependencies.participation.findEnrollment(student.id, courseId))
    if (!enrollment)
      throw new ApplicationError(
        'You must enroll before accessing this course',
        'ENROLLMENT_REQUIRED',
        403,
      )
    const progress = await this.dependencies.participation.findProgress(student.id, courseId)
    const resolvedEnrollment = progress?.enrollment ?? enrollment
    const authorRating = resolvedEnrollment.completedAt
      ? await this.dependencies.participation.findAuthorRating(student.id, courseId)
      : null
    const certificate = resolvedEnrollment.completedAt && aggregate.course.certificateOnCompletion
      ? await this.dependencies.certificates.issue(
          student,
          aggregate.course,
          resolvedEnrollment.completedAt,
        )
      : null
    return {
      ...aggregate,
      enrollment: resolvedEnrollment,
      completedModuleIds: progress?.completedModules.map((item) => item.moduleId) ?? [],
      certificate,
      authorRating,
    }
  }

  async rateAuthor(student: Student, courseId: string, rating: number) {
    const aggregate = await this.availableCourse(courseId)
    const enrollment = await this.dependencies.participation.findEnrollment(student.id, courseId)
    if (!enrollment?.completedAt)
      throw new ApplicationError(
        'Complete this course before rating its author',
        'COURSE_NOT_COMPLETED',
        403,
      )
    const savedRating = await this.dependencies.participation.upsertAuthorRating({
      authorId: aggregate.course.createdByAuthorId,
      courseId,
      studentId: student.id,
      rating,
    })
    return {
      rating: savedRating,
      summary: await this.dependencies.participation.getAuthorRatingSummary(
        aggregate.course.createdByAuthorId,
      ),
    }
  }

  async completeModule(student: Student, courseId: string, moduleId: string) {
    const aggregate = await this.availableCourse(courseId)
    const enrollment = await this.dependencies.participation.findEnrollment(student.id, courseId)
    if (!enrollment)
      throw new ApplicationError(
        'You must enroll before recording progress',
        'ENROLLMENT_REQUIRED',
        403,
      )
    const targetIndex = aggregate.modules.findIndex((item) => item.id === moduleId)
    if (targetIndex < 0)
      throw new ApplicationError('Module does not belong to this course', 'MODULE_NOT_FOUND', 404)
    const current = await this.dependencies.participation.findProgress(student.id, courseId)
    const completed = new Set(current?.completedModules.map((item) => item.moduleId) ?? [])
    const incompletePrerequisite = aggregate.modules
      .slice(0, targetIndex)
      .some((module) => !completed.has(module.id))
    if (incompletePrerequisite)
      throw new ApplicationError('Complete earlier modules first', 'MODULE_ORDER_REQUIRED', 409)
    const record = await this.dependencies.participation.completeModule({
      enrollmentId: enrollment.id,
      courseId,
      moduleId,
      studentId: student.id,
      completedAt: new Date(),
    })
    completed.add(moduleId)
    let courseCompleted = false
    if (
      aggregate.modules.length > 0 &&
      completed.size === aggregate.modules.length &&
      !(await this.dependencies.assessments.findByCourseId(courseId))
    ) {
      const completedAt = new Date()
      await this.dependencies.participation.markEnrollmentCompleted(enrollment.id, completedAt)
      courseCompleted = true
      if (aggregate.course.certificateOnCompletion)
        await this.dependencies.certificates.issue(student, aggregate.course, completedAt)
    }
    return { progress: record, courseCompleted }
  }

  async listMine(student: Student) {
    const records = await this.dependencies.participation.listForStudent(student.id)
    return Promise.all(
      records.map(async (record) => {
        const aggregate = await this.dependencies.courses.findById(record.enrollment.courseId)
        const course = aggregate?.course
        const author = course ? await this.dependencies.authors.findById(course.createdByAuthorId) : null
        return {
          ...record,
          moduleCount: aggregate?.modules.length ?? 0,
          course: course ?? null,
          authorName: author ? `${author.firstName} ${author.lastName}` : null,
          certificate:
            course && record.enrollment.completedAt && course.certificateOnCompletion
              ? await this.dependencies.certificates.issue(
                  student,
                  course,
                  record.enrollment.completedAt,
                )
              : null,
        }
      }),
    )
  }

  async listParticipants(author: Author, courseId: string) {
    const aggregate = await this.dependencies.courses.findById(courseId)
    if (!aggregate) throw new ApplicationError('Course not found', 'COURSE_NOT_FOUND', 404)
    if (aggregate.course.createdByAuthorId !== author.id)
      throw new ApplicationError('Only the course author can see participants', 'FORBIDDEN', 403)
    const [participants, assessment] = await Promise.all([
      this.dependencies.participation.listParticipants(courseId),
      this.dependencies.assessments.findByCourseId(courseId),
    ])
    const attempts = assessment
      ? await this.dependencies.assessments.listAttempts(assessment.id)
      : []
    const latestAttempts = new Map<string, (typeof attempts)[number]>()
    for (const attempt of attempts) {
      if (!latestAttempts.has(attempt.studentId)) latestAttempts.set(attempt.studentId, attempt)
    }
    return participants.map((item) => {
      const attempt = latestAttempts.get(item.student.id) ?? null
      return {
        ...item,
        moduleCount: aggregate.modules.length,
        completedCount: item.completedModules.length,
        assessment: assessment
          ? {
              attempt,
              status: attempt?.status ?? 'not_started',
              score: attempt?.score ?? null,
              passed: attempt?.passed ?? null,
            }
          : null,
      }
    })
  }

  private async availableCourse(courseId: string) {
    const aggregate = await this.dependencies.courses.findById(courseId)
    if (!aggregate) throw new ApplicationError('Course not found', 'COURSE_NOT_FOUND', 404)
    if (aggregate.course.scheduledAt && aggregate.course.scheduledAt.getTime() > Date.now())
      throw new ApplicationError(
        `Course will be available on ${aggregate.course.scheduledAt.toISOString()}`,
        'COURSE_NOT_AVAILABLE',
        403,
      )
    return aggregate
  }
}
