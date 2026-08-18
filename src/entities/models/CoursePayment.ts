import type { BaseEntity } from './base'

export const COURSE_PAYMENT_STATUSES = ['pending', 'initialized', 'succeeded', 'failed'] as const
export type CoursePaymentStatus = (typeof COURSE_PAYMENT_STATUSES)[number]
export type PaymentVerificationSource = 'callback' | 'webhook' | 'charge'

export interface CoursePayment extends BaseEntity {
  reference: string
  activeKey: string | null
  purpose: 'course_purchase' | 'card_setup'
  courseId: string | null
  studentId: string
  customerEmail: string
  amountKobo: number
  currency: 'NGN'
  adapter: 'paystack'
  status: CoursePaymentStatus
  requestedSaveMethod: boolean
  selectedPaymentMethodId: string | null
  authorizationUrl: string | null
  accessCode: string | null
  failureReason: string | null
  providerTransactionId: string | null
  providerReceiptNumber: string | null
  providerEnvironment: string | null
  paymentMethod: string | null
  gatewayResponse: string | null
  gatewayResponseCode: string | null
  processorResponseCode: string | null
  feesKobo: number | null
  requestedAmountKobo: number | null
  customerCode: string | null
  bankName: string | null
  accountName: string | null
  cardBrand: string | null
  cardType: string | null
  cardLast4: string | null
  cardExpMonth: string | null
  cardExpYear: string | null
  authorizationSignature: string | null
  countryCode: string | null
  providerCreatedAt: Date | null
  paidAt: Date | null
  verifiedAt: Date | null
  verifiedBy: PaymentVerificationSource | null
  refundStatus: 'requesting' | 'pending' | 'processing' | 'processed' | 'failed' | null
}

export type CreateCoursePayment = Omit<CoursePayment, keyof BaseEntity>
