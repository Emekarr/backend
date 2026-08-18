import type { BaseEntity } from './base'

export interface PaymentAuthorization extends BaseEntity {
  studentId: string
  adapter: 'paystack'
  authorizationCodeEncrypted: string
  authorizationEmail: string
  signature: string
  channel: string
  cardType: string
  brand: string
  last4: string
  expMonth: string
  expYear: string
  bin: string
  bank: string
  countryCode: string
  accountName: string | null
  reusable: boolean
  disabledAt: Date | null
}

export type CreatePaymentAuthorization = Omit<PaymentAuthorization, keyof BaseEntity>
