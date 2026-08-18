export interface InitializePaymentInput {
  email: string
  amountKobo: number
  reference: string
  callbackUrl: string
  metadata: { courseId: string | null; studentId: string; purpose: string; saveMethod: boolean }
  channels?: string[]
}

export interface InitializedPayment {
  authorizationUrl: string
  accessCode: string
  reference: string
}

export interface VerifiedPayment {
  reference: string
  status: string
  amountKobo: number
  currency: string
  customerEmail: string | null
  paidAt: Date | null
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
  countryCode: string | null
  providerCreatedAt: Date | null
  authorization: PaymentAuthorizationDetails | null
}

export interface PaymentAuthorizationDetails {
  authorizationCode: string
  bin: string
  last4: string
  expMonth: string
  expYear: string
  channel: string
  cardType: string
  bank: string
  countryCode: string
  brand: string
  reusable: boolean
  signature: string
  accountName: string | null
}

export interface ChargedAuthorization extends VerifiedPayment {
  paused: boolean
  authorizationUrl: string | null
  accessCode: string | null
}

export interface PaymentGateway {
  initialize(input: InitializePaymentInput): Promise<InitializedPayment>
  verify(reference: string): Promise<VerifiedPayment>
  chargeAuthorization(input: {
    authorizationCode: string
    email: string
    amountKobo: number
    reference: string
    callbackUrl: string
    metadata: InitializePaymentInput['metadata']
  }): Promise<ChargedAuthorization>
  refund(reference: string, amountKobo: number): Promise<{ status: string }>
  deactivateAuthorization(authorizationCode: string): Promise<void>
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean
}
