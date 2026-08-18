import { Schema } from 'mongoose'
import type { PaymentAuthorization } from '../../../../entities/models/PaymentAuthorization'
import { baseSchema, baseSchemaOptions } from './base'

export const PaymentAuthorizationSchema = new Schema<PaymentAuthorization>(
  {
    ...baseSchema,
    studentId: { type: String, required: true, index: true },
    adapter: { type: String, enum: ['paystack'], required: true },
    authorizationCodeEncrypted: { type: String, required: true },
    authorizationEmail: { type: String, required: true, lowercase: true, trim: true },
    signature: { type: String, required: true },
    channel: { type: String, required: true },
    cardType: { type: String, required: true },
    brand: { type: String, required: true },
    last4: { type: String, required: true },
    expMonth: { type: String, required: true },
    expYear: { type: String, required: true },
    bin: { type: String, required: true },
    bank: { type: String, required: true },
    countryCode: { type: String, required: true },
    accountName: { type: String, default: null },
    reusable: { type: Boolean, required: true },
    disabledAt: { type: Date, default: null },
  },
  baseSchemaOptions,
)

PaymentAuthorizationSchema.index({ studentId: 1, signature: 1 }, { unique: true })
