import { ApplicationError } from '../../entities/errors/applicationError'
import type {
  CertificateDocumentRenderer,
  CertificateRepository,
} from '../../entities/interfaces/certificateRepository'
import type { CourseCatalogRepository } from '../../entities/interfaces/courseRepository'
import type { CourseParticipationRepository } from '../../entities/interfaces/courseParticipationRepository'
import type { EmailJobQueue } from '../../entities/interfaces/services'
import type { Course } from '../../entities/models/Course'
import type { Student } from '../../entities/models/Student'

export class CertificateService {
  constructor(
    private readonly dependencies: {
      certificates: CertificateRepository
      renderer: CertificateDocumentRenderer
      courses: CourseCatalogRepository
      participation: CourseParticipationRepository
      emailJobs: EmailJobQueue
    },
  ) {}

  async issue(student: Student, course: Course, completedAt: Date) {
    return this.dependencies.certificates.issue({
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`.trim(),
      courseId: course.id,
      courseName: course.name,
      completedAt,
      issuedAt: new Date(),
    })
  }

  async getForCompletedCourse(student: Student, courseId: string) {
    const [aggregate, enrollment] = await Promise.all([
      this.dependencies.courses.findById(courseId),
      this.dependencies.participation.findEnrollment(student.id, courseId),
    ])
    if (!aggregate) throw new ApplicationError('Course not found', 'COURSE_NOT_FOUND', 404)
    if (!enrollment?.completedAt)
      throw new ApplicationError(
        'Complete the course and its final assessment before receiving a certificate',
        'COURSE_NOT_COMPLETED',
        409,
      )
    return this.issue(student, aggregate.course, enrollment.completedAt)
  }

  async publicDetails(certificateNumber: string) {
    const certificate = await this.dependencies.certificates.findByNumber(certificateNumber)
    if (!certificate)
      return { recognized: false as const, valid: false as const, certificate: null }
    return {
      recognized: true as const,
      valid: !certificate.revokedAt,
      certificate: {
        certificateNumber: certificate.certificateNumber,
        studentName: certificate.studentName,
        courseName: certificate.courseName,
        completedAt: certificate.completedAt,
        issuedAt: certificate.issuedAt,
        revokedAt: certificate.revokedAt,
      },
      verificationUrl: this.dependencies.renderer.verificationUrl(certificate.certificateNumber),
    }
  }

  async renderPublic(certificateNumber: string) {
    const certificate = await this.dependencies.certificates.findByNumber(certificateNumber)
    if (!certificate)
      throw new ApplicationError('Certificate not found', 'CERTIFICATE_NOT_FOUND', 404)
    return {
      certificate,
      pdf: await this.dependencies.renderer.render(certificate),
      fileName: `DANVIC-${certificate.courseName}-${certificate.studentName}`
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 120)
        .concat('.pdf'),
    }
  }

  async sendToEmail(student: Student, certificateId: string, email: string) {
    const certificate = await this.dependencies.certificates.findById(certificateId)
    if (!certificate || certificate.studentId !== student.id)
      throw new ApplicationError('Certificate not found', 'CERTIFICATE_NOT_FOUND', 404)
    await this.dependencies.emailJobs.enqueue({
      type: 'certificate',
      certificateId: certificate.id,
      email: email.toLowerCase(),
    })
  }
}
