import type {
  CoursePayment,
  CreateCoursePayment,
  PaymentVerificationSource,
} from '../models/CoursePayment'
import type { VerifiedPayment } from './payment'

export interface CoursePaymentRepository {
  createOrFindActive(input: CreateCoursePayment): Promise<CoursePayment>
  findByReference(reference: string): Promise<CoursePayment | null>
  listForStudent(studentId: string, limit: number): Promise<CoursePayment[]>
  markInitialized(
    reference: string,
    input: { authorizationUrl: string; accessCode: string },
  ): Promise<CoursePayment>
  markInitializationFailed(reference: string, reason: string): Promise<void>
  markSucceeded(
    reference: string,
    input: {
      transaction: VerifiedPayment
      paidAt: Date
      verifiedAt: Date
      verifiedBy: PaymentVerificationSource
    },
  ): Promise<CoursePayment>
  listByCourseIds(courseIds: string[], limit: number): Promise<CoursePayment[]>
  claimRefund(reference: string): Promise<boolean>
  markRefundStatus(
    reference: string,
    status: NonNullable<CoursePayment['refundStatus']>,
  ): Promise<void>
}
