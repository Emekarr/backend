import { createHmac, timingSafeEqual } from 'node:crypto'
import { ApplicationError } from '../../entities/errors/applicationError'
import type {
  ChargedAuthorization,
  InitializedPayment,
  InitializePaymentInput,
  PaymentAuthorizationDetails,
  PaymentGateway,
  VerifiedPayment,
} from '../../entities/interfaces/payment'
import type { EnvironmentConfig } from '../config/environment'

type PaystackEnvelope<T> = { status?: boolean; message?: string; data?: T }

export class PaystackGateway implements PaymentGateway {
  private readonly baseUrl: string
  private readonly secretKey: string
  private readonly timeoutMs: number

  constructor(config: EnvironmentConfig) {
    this.baseUrl = config.PAYSTACK_API_BASE_URL
    this.secretKey = config.PAYSTACK_SECRET_KEY
    this.timeoutMs = config.PAYSTACK_TIMEOUT_MS
  }

  async initialize(input: InitializePaymentInput): Promise<InitializedPayment> {
    const payload = await this.request<{
      authorization_url?: unknown
      access_code?: unknown
      reference?: unknown
    }>('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: input.email,
        amount: String(input.amountKobo),
        currency: 'NGN',
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: JSON.stringify(input.metadata),
        ...(input.channels ? { channels: input.channels } : {}),
      }),
    })
    if (
      typeof payload.authorization_url !== 'string' ||
      typeof payload.access_code !== 'string' ||
      typeof payload.reference !== 'string'
    )
      throw providerError('Paystack returned an incomplete initialization response')
    const authorizationUrl = new URL(payload.authorization_url)
    if (
      authorizationUrl.protocol !== 'https:' ||
      !(
        authorizationUrl.hostname === 'paystack.com' ||
        authorizationUrl.hostname.endsWith('.paystack.com')
      )
    )
      throw providerError('Paystack returned an invalid authorization URL')
    return {
      authorizationUrl: authorizationUrl.toString(),
      accessCode: payload.access_code,
      reference: payload.reference,
    }
  }

  async verify(reference: string): Promise<VerifiedPayment> {
    const payload = await this.request<{
      id?: unknown
      receipt_number?: unknown
      domain?: unknown
      reference?: unknown
      status?: unknown
      amount?: unknown
      currency?: unknown
      paid_at?: unknown
      created_at?: unknown
      channel?: unknown
      gateway_response?: unknown
      gateway_response_code?: unknown
      response_code?: unknown
      fees?: unknown
      requested_amount?: unknown
      customer?: { email?: unknown; customer_code?: unknown }
      authorization?: {
        authorization_code?: unknown
        bin?: unknown
        channel?: unknown
        last4?: unknown
        exp_month?: unknown
        exp_year?: unknown
        card_type?: unknown
        bank?: unknown
        country_code?: unknown
        brand?: unknown
        account_name?: unknown
        reusable?: unknown
        signature?: unknown
      }
    }>(`/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' })
    const authorization = payload.authorization
    return {
      reference: text(payload.reference) ?? '',
      status: text(payload.status) ?? '',
      amountKobo: typeof payload.amount === 'number' ? payload.amount : Number.NaN,
      currency: text(payload.currency) ?? '',
      customerEmail:
        typeof payload.customer?.email === 'string' ? payload.customer.email.toLowerCase() : null,
      paidAt: parseDate(payload.paid_at),
      providerTransactionId: transactionId(payload.id),
      providerReceiptNumber: text(payload.receipt_number, 100),
      providerEnvironment: text(payload.domain, 20),
      paymentMethod: text(payload.channel ?? authorization?.channel, 50),
      gatewayResponse: text(payload.gateway_response, 500),
      gatewayResponseCode: text(payload.gateway_response_code, 100),
      processorResponseCode: text(payload.response_code, 20),
      feesKobo: safeKobo(payload.fees),
      requestedAmountKobo: safeKobo(payload.requested_amount),
      customerCode: text(payload.customer?.customer_code, 100),
      bankName: text(authorization?.bank, 200),
      accountName: text(authorization?.account_name, 200),
      cardBrand: text(authorization?.brand, 50),
      cardType: text(authorization?.card_type, 100),
      cardLast4: last4(authorization?.last4),
      countryCode: countryCode(authorization?.country_code),
      providerCreatedAt: parseDate(payload.created_at),
      authorization: paymentAuthorization(authorization),
    }
  }

  async chargeAuthorization(input: {
    authorizationCode: string
    email: string
    amountKobo: number
    reference: string
    callbackUrl: string
    metadata: InitializePaymentInput['metadata']
  }): Promise<ChargedAuthorization> {
    const payload = await this.request<Record<string, unknown>>(
      '/transaction/charge_authorization',
      {
        method: 'POST',
        body: JSON.stringify({
          authorization_code: input.authorizationCode,
          email: input.email,
          amount: String(input.amountKobo),
          currency: 'NGN',
          reference: input.reference,
          callback_url: input.callbackUrl,
          metadata: JSON.stringify(input.metadata),
        }),
      },
    )
    const paused = payload.paused === true
    const authorizationUrl = text(payload.authorization_url, 2048)
    if (authorizationUrl) this.assertPaystackUrl(authorizationUrl)
    return {
      ...verifiedPayment(payload),
      paused,
      authorizationUrl,
      accessCode: text(payload.access_code, 200),
    }
  }

  async refund(reference: string, amountKobo: number): Promise<{ status: string }> {
    const payload = await this.request<{ status?: unknown }>('/refund', {
      method: 'POST',
      body: JSON.stringify({
        transaction: reference,
        amount: amountKobo,
        currency: 'NGN',
        customer_note: 'Refund of DANVIC card verification charge',
        merchant_note: 'Automatic refund for saved-card verification',
      }),
    })
    return { status: text(payload.status, 30) ?? 'pending' }
  }

  async deactivateAuthorization(authorizationCode: string): Promise<void> {
    await this.request<unknown>('/customer/authorization/deactivate', {
      method: 'POST',
      body: JSON.stringify({ authorization_code: authorizationCode }),
    })
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    if (!/^[a-f0-9]{128}$/i.test(signature)) return false
    const expected = createHmac('sha512', this.secretKey).update(rawBody).digest()
    const received = Buffer.from(signature, 'hex')
    return received.length === expected.length && timingSafeEqual(received, expected)
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.secretKey}`,
          accept: 'application/json',
          'content-type': 'application/json',
        },
      })
      const body = (await response.json().catch(() => null)) as PaystackEnvelope<T> | null
      if (!response.ok || !body?.status)
        throw providerError(
          body?.message ?? `Paystack request failed with status ${response.status}`,
        )
      return body.data as T
    } catch (error) {
      if (error instanceof ApplicationError) throw error
      throw providerError(error instanceof Error ? error.message : 'Paystack request failed')
    } finally {
      clearTimeout(timeout)
    }
  }

  private assertPaystackUrl(value: string): void {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      !(url.hostname === 'paystack.com' || url.hostname.endsWith('.paystack.com'))
    )
      throw providerError('Paystack returned an invalid authorization URL')
  }
}

const providerError = (message: string) =>
  new ApplicationError(message, 'PAYMENT_PROVIDER_ERROR', 502)

const parseDate = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const text = (value: unknown, maximum = 500): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, maximum) : null

const safeKobo = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null

const transactionId = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value)
  if (typeof value === 'string' && /^\d{1,20}$/.test(value)) return value
  return null
}

const last4 = (value: unknown): string | null => {
  const result = text(value, 4)
  return result && /^[A-Za-z0-9]{4}$/.test(result) ? result : null
}

const countryCode = (value: unknown): string | null => {
  const result = text(value, 2)?.toUpperCase() ?? null
  return result && /^[A-Z]{2}$/.test(result) ? result : null
}

const paymentAuthorization = (
  value: Record<string, unknown> | undefined,
): PaymentAuthorizationDetails | null => {
  const authorizationCode = text(value?.authorization_code, 200)
  const signature = text(value?.signature, 200)
  if (!authorizationCode || !signature) return null
  return {
    authorizationCode,
    signature,
    bin: text(value?.bin, 8) ?? '',
    last4: last4(value?.last4) ?? '',
    expMonth: numericText(value?.exp_month, 2),
    expYear: numericText(value?.exp_year, 4),
    channel: text(value?.channel, 50) ?? '',
    cardType: text(value?.card_type, 100) ?? '',
    bank: text(value?.bank, 200) ?? '',
    countryCode: countryCode(value?.country_code) ?? '',
    brand: text(value?.brand, 50) ?? '',
    reusable: value?.reusable === true,
    accountName: text(value?.account_name, 200),
  }
}

const numericText = (value: unknown, maximum: number): string => {
  if (typeof value === 'number' && Number.isSafeInteger(value))
    return String(value).padStart(2, '0')
  return text(value, maximum) ?? ''
}

const verifiedPayment = (payload: Record<string, unknown>): VerifiedPayment => {
  const customer = payload.customer as Record<string, unknown> | undefined
  const authorization = payload.authorization as Record<string, unknown> | undefined
  return {
    reference: text(payload.reference) ?? '',
    status: text(payload.status) ?? '',
    amountKobo: typeof payload.amount === 'number' ? payload.amount : Number.NaN,
    currency: text(payload.currency) ?? '',
    customerEmail: text(customer?.email, 320)?.toLowerCase() ?? null,
    paidAt: parseDate(payload.paid_at ?? payload.paidAt),
    providerTransactionId: transactionId(payload.id),
    providerReceiptNumber: text(payload.receipt_number, 100),
    providerEnvironment: text(payload.domain, 20),
    paymentMethod: text(payload.channel ?? authorization?.channel, 50),
    gatewayResponse: text(payload.gateway_response, 500),
    gatewayResponseCode: text(payload.gateway_response_code, 100),
    processorResponseCode: text(payload.response_code, 20),
    feesKobo: safeKobo(payload.fees),
    requestedAmountKobo: safeKobo(payload.requested_amount),
    customerCode: text(customer?.customer_code, 100),
    bankName: text(authorization?.bank, 200),
    accountName: text(authorization?.account_name, 200),
    cardBrand: text(authorization?.brand, 50),
    cardType: text(authorization?.card_type, 100),
    cardLast4: last4(authorization?.last4),
    countryCode: countryCode(authorization?.country_code),
    providerCreatedAt: parseDate(payload.created_at),
    authorization: paymentAuthorization(authorization),
  }
}
