import type { CourseEnrollment } from '../models/CourseEnrollment'
import type { ModuleProgress } from '../models/ModuleProgress'

export interface EnrollmentProgress {
  enrollment: CourseEnrollment
  completedModules: ModuleProgress[]
}

export interface ParticipantProgress extends EnrollmentProgress {
  student: { id: string; firstName: string; lastName: string; email: string }
}

export interface CourseParticipationRepository {
  enroll(input: {
    courseId: string
    studentId: string
    source: CourseEnrollment['source']
    invitationId: string
    paymentReference: string | null
    enrolledAt: Date
  }): Promise<CourseEnrollment>
  findEnrollment(studentId: string, courseId: string): Promise<CourseEnrollment | null>
  findProgress(studentId: string, courseId: string): Promise<EnrollmentProgress | null>
  completeModule(input: {
    enrollmentId: string
    courseId: string
    moduleId: string
    studentId: string
    completedAt: Date
  }): Promise<ModuleProgress>
  markEnrollmentCompleted(enrollmentId: string, completedAt: Date): Promise<void>
  resetCourseCompletion(courseId: string): Promise<void>
  upsertAuthorRating(input: {
    authorId: string
    courseId: string
    studentId: string
    rating: number
  }): Promise<number>
  findAuthorRating(studentId: string, courseId: string): Promise<number | null>
  getAuthorRatingSummary(authorId: string): Promise<{ average: number; count: number }>
  listForStudent(studentId: string): Promise<EnrollmentProgress[]>
  listParticipants(courseId: string): Promise<ParticipantProgress[]>
}
