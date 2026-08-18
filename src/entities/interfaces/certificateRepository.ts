import type { Certificate } from '../models/Certificate'

export interface CertificateRepository {
  issue(input: {
    studentId: string
    studentName: string
    courseId: string
    courseName: string
    completedAt: Date
    issuedAt: Date
  }): Promise<Certificate>
  findById(id: string): Promise<Certificate | null>
  findByNumber(certificateNumber: string): Promise<Certificate | null>
  findForStudentCourse(studentId: string, courseId: string): Promise<Certificate | null>
}

export interface CertificateDocumentRenderer {
  render(certificate: Certificate): Promise<Buffer>
  verificationUrl(certificateNumber: string): string
}
