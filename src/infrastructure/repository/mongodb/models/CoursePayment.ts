import { Schema } from 'mongoose'
import {
  COURSE_PAYMENT_STATUSES,
  type CoursePayment,
} from '../../../../entities/models/CoursePayment'
import { baseSchema, baseSchemaOptions } from './base'

export const CoursePaymentSchema = new Schema<CoursePayment>(
  {
    ...baseSchema,
    reference: { type: String, required: true, unique: true, index: true },
    activeKey: { type: String, default: null },
    purpose: {
      type: String,
      enum: ['course_purchase', 'card_setup'],
      required: true,
      default: 'course_purchase',
    },
    courseId: { type: String, default: null, index: true },
    studentId: { type: String, required: true, index: true },
    customerEmail: { type: String, required: true, lowercase: true, trim: true },
    amountKobo: { type: Number, required: true, min: 1, max: 1_000_000_000 },
    currency: { type: String, enum: ['NGN'], required: true },
    adapter: { type: String, enum: ['paystack'], required: true },
    status: { type: String, enum: COURSE_PAYMENT_STATUSES, required: true, index: true },
    requestedSaveMethod: { type: Boolean, required: true, default: false },
    selectedPaymentMethodId: { type: String, default: null },
    authorizationUrl: { type: String, default: null },
    accessCode: { type: String, default: null },
    failureReason: { type: String, default: null },
    providerTransactionId: { type: String, default: null, maxlength: 32 },
    providerReceiptNumber: { type: String, default: null, maxlength: 100 },
    providerEnvironment: { type: String, default: null, maxlength: 20 },
    paymentMethod: { type: String, default: null, maxlength: 50 },
    gatewayResponse: { type: String, default: null, maxlength: 500 },
    gatewayResponseCode: { type: String, default: null, maxlength: 100 },
    processorResponseCode: { type: String, default: null, maxlength: 20 },
    feesKobo: { type: Number, default: null, min: 0, max: 1_000_000_000 },
    requestedAmountKobo: { type: Number, default: null, min: 0, max: 1_000_000_000 },
    customerCode: { type: String, default: null, maxlength: 100 },
    bankName: { type: String, default: null, maxlength: 200 },
    accountName: { type: String, default: null, maxlength: 200 },
    cardBrand: { type: String, default: null, maxlength: 50 },
    cardType: { type: String, default: null, maxlength: 100 },
    cardLast4: { type: String, default: null, maxlength: 4 },
    cardExpMonth: { type: String, default: null, maxlength: 2 },
    cardExpYear: { type: String, default: null, maxlength: 4 },
    authorizationSignature: { type: String, default: null, maxlength: 200 },
    countryCode: { type: String, default: null, maxlength: 2 },
    providerCreatedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: String, enum: ['callback', 'webhook', 'charge'], default: null },
    refundStatus: {
      type: String,
      enum: ['requesting', 'pending', 'processing', 'processed', 'failed'],
      default: null,
    },
  },
  baseSchemaOptions,
)

CoursePaymentSchema.index({ studentId: 1, courseId: 1, createdAt: -1 })
CoursePaymentSchema.index(
  { activeKey: 1 },
  { unique: true, partialFilterExpression: { activeKey: { $type: 'string' } } },
)
