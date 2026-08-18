import { ApplicationError } from '../../entities/errors/applicationError'
import type { SecretCipher } from '../../entities/interfaces/auth'
import type { CoursePaymentRepository } from '../../entities/interfaces/coursePaymentRepository'
import type { CourseParticipationRepository } from '../../entities/interfaces/courseParticipationRepository'
import type { CourseCatalogRepository } from '../../entities/interfaces/courseRepository'
import type { PaymentGateway, VerifiedPayment } from '../../entities/interfaces/payment'
import type { PaymentAuthorizationRepository } from '../../entities/interfaces/paymentAuthorizationRepository'
import type {
  CoursePayment,
  CreateCoursePayment,
  PaymentVerificationSource,
} from '../../entities/models/CoursePayment'
import type { PaymentAuthorization } from '../../entities/models/PaymentAuthorization'
import type { Student } from '../../entities/models/Student'
import type { Author } from '../../entities/models/Author'
import { generateID } from '../../infrastructure/identifiers/generators'
import type { AdminNotificationService } from '../admin/AdminNotificationService'

const CARD_SETUP_AMOUNT_KOBO = 5_000

export interface PaystackEvent {
  event: string
  data?: { reference?: unknown; transaction_reference?: unknown; status?: unknown }
}

export class CoursePaymentService {
  constructor(
    private readonly dependencies: {
      courses: CourseCatalogRepository
      payments: CoursePaymentRepository
      authorizations: PaymentAuthorizationRepository
      participation: CourseParticipationRepository
      gateway: PaymentGateway
      authorizationCipher: SecretCipher
      notifications: AdminNotificationService
    },
  ) {}

  async initialize(
    student: Student,
    courseId: string,
    options: { paymentMethodId?: string | null; savePaymentMethod: boolean; callbackUrl: string },
  ) {
    this.assertPaymentSecurity(student)
    const callbackUrl = this.assertCallbackUrl(options.callbackUrl)
    const course = await this.availablePaidCourse(courseId)
    const enrollment = await this.dependencies.participation.findEnrollment(student.id, courseId)
    if (enrollment)
      throw new ApplicationError(
        'You already have access to this course',
        'COURSE_ALREADY_ENROLLED',
        409,
      )

    const reference = `DANVIC-${generateID()}`
    const payment = await this.dependencies.payments.createOrFindActive(
      this.newPayment({
        reference,
        activeKey: `course:${student.id}:${courseId}`,
        purpose: 'course_purchase',
        courseId,
        student,
        amountKobo: course.priceKobo,
        requestedSaveMethod: options.savePaymentMethod,
        selectedPaymentMethodId: options.paymentMethodId ?? null,
      }),
    )
    if (payment.reference !== reference) return this.resumeActivePayment(payment)

    if (options.paymentMethodId) {
      const method = await this.paymentMethod(student, options.paymentMethodId)
      try {
        const charged = await this.dependencies.gateway.chargeAuthorization({
          authorizationCode: this.dependencies.authorizationCipher.decrypt(
            method.authorizationCodeEncrypted,
          ),
          email: method.authorizationEmail,
          amountKobo: course.priceKobo,
          reference,
          callbackUrl,
          metadata: {
            courseId,
            studentId: student.id,
            purpose: 'course_purchase',
            saveMethod: false,
          },
        })
        if (charged.reference !== reference)
          throw providerError('Paystack returned an unexpected transaction reference')
        if (charged.status === 'success') return this.fulfill(reference, charged, 'charge')
        if (charged.paused && charged.authorizationUrl && charged.accessCode) {
          const initialized = await this.dependencies.payments.markInitialized(reference, {
            authorizationUrl: charged.authorizationUrl,
            accessCode: charged.accessCode,
          })
          return checkoutResponse(initialized)
        }
        throw new ApplicationError(
          charged.gatewayResponse ?? 'The saved card could not be charged',
          'PAYMENT_NOT_SUCCESSFUL',
          409,
        )
      } catch (error) {
        await this.failInitialization(reference, error)
        throw error
      }
    }

    return this.initializeHostedCheckout(
      payment,
      student,
      options.savePaymentMethod ? ['card'] : undefined,
      callbackUrl,
    )
  }

  async initializeCardSetup(student: Student, callbackUrl: string) {
    this.assertPaymentSecurity(student)
    const reference = `DANVIC-${generateID()}`
    const payment = await this.dependencies.payments.createOrFindActive(
      this.newPayment({
        reference,
        activeKey: `card-setup:${student.id}`,
        purpose: 'card_setup',
        courseId: null,
        student,
        amountKobo: CARD_SETUP_AMOUNT_KOBO,
        requestedSaveMethod: true,
        selectedPaymentMethodId: null,
      }),
    )
    if (payment.reference !== reference) return this.resumeActivePayment(payment)
    return this.initializeHostedCheckout(
      payment,
      student,
      ['card'],
      this.assertCallbackUrl(callbackUrl),
    )
  }

  async verify(reference: string) {
    const transaction = await this.dependencies.gateway.verify(reference)
    return this.fulfill(reference, transaction, 'callback')
  }

  async listMine(student: Student) {
    const [methods, transactions] = await Promise.all([
      this.dependencies.authorizations.listForStudent(student.id),
      this.dependencies.payments.listForStudent(student.id, 200),
    ])
    return {
      paymentMethods: methods.map(publicMethod),
      transactions: transactions.map(publicTransaction),
      cardSetupAmountKobo: CARD_SETUP_AMOUNT_KOBO,
    }
  }

  async listForAuthor(author: Author) {
    const courses = await this.dependencies.courses.findByAuthor(author.id)
    const courseIds = courses.map((course) => course.id)
    const transactions = await this.dependencies.payments.listByCourseIds(courseIds, 1_000)
    return {
      transactions: transactions.map((payment) => ({
        ...publicTransaction(payment),
        customerEmail: payment.customerEmail,
      })),
    }
  }

  async removePaymentMethod(student: Student, paymentMethodId: string) {
    const method = await this.paymentMethod(student, paymentMethodId)
    await this.dependencies.gateway.deactivateAuthorization(
      this.dependencies.authorizationCipher.decrypt(method.authorizationCodeEncrypted),
    )
    await this.dependencies.authorizations.disable(student.id, method.id, new Date())
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined, event: PaystackEvent) {
    if (!signature || !this.dependencies.gateway.verifyWebhookSignature(rawBody, signature))
      throw new ApplicationError('Invalid Paystack webhook signature', 'INVALID_WEBHOOK', 401)

    if (event.event === 'charge.success') {
      const reference = event.data?.reference
      if (typeof reference !== 'string')
        throw new ApplicationError('Invalid Paystack webhook payload', 'INVALID_WEBHOOK', 400)
      await this.fulfill(reference, await this.dependencies.gateway.verify(reference), 'webhook')
      return { processed: true }
    }

    if (event.event.startsWith('refund.')) {
      const reference = event.data?.transaction_reference
      const status = event.event.slice('refund.'.length)
      if (
        typeof reference === 'string' &&
        ['pending', 'processing', 'processed', 'failed'].includes(status)
      ) {
        await this.dependencies.payments.markRefundStatus(
          reference,
          status as 'pending' | 'processing' | 'processed' | 'failed',
        )
        if (status === 'failed')
          await this.dependencies.notifications.publish({
            title: 'Payment refund failed',
            body: `Refund processing failed for payment ${reference}.`,
            link: '/courses',
          })
      }
      return { processed: true }
    }

    return { processed: false }
  }

  private async initializeHostedCheckout(
    payment: CoursePayment,
    student: Student,
    channels: string[] | undefined,
    callbackUrl: string,
  ) {
    try {
      const initialized = await this.dependencies.gateway.initialize({
        email: student.email,
        amountKobo: payment.amountKobo,
        reference: payment.reference,
        callbackUrl,
        metadata: {
          courseId: payment.courseId,
          studentId: student.id,
          purpose: payment.purpose,
          saveMethod: payment.requestedSaveMethod,
        },
        channels,
      })
      if (initialized.reference !== payment.reference)
        throw providerError('Paystack returned an unexpected transaction reference')
      const saved = await this.dependencies.payments.markInitialized(payment.reference, {
        authorizationUrl: initialized.authorizationUrl,
        accessCode: initialized.accessCode,
      })
      return checkoutResponse(saved)
    } catch (error) {
      await this.failInitialization(payment.reference, error)
      if (error instanceof ApplicationError) throw error
      throw providerError('Payment could not be initialized. Please try again.')
    }
  }

  private async fulfill(
    reference: string,
    transaction: VerifiedPayment,
    source: PaymentVerificationSource,
  ) {
    const payment = await this.dependencies.payments.findByReference(reference)
    if (!payment)
      throw new ApplicationError('Payment reference was not found', 'PAYMENT_NOT_FOUND', 404)
    this.assertMatchingTransaction(payment, transaction)

    const now = new Date()
    const succeeded = await this.dependencies.payments.markSucceeded(reference, {
      transaction,
      paidAt: transaction.paidAt ?? payment.paidAt ?? now,
      verifiedAt: now,
      verifiedBy: source,
    })
    const cardSaved = await this.saveAuthorizationIfRequested(succeeded, transaction)

    if (payment.purpose === 'card_setup') {
      const refundStatus = await this.refundCardSetup(succeeded)
      return {
        status: 'success' as const,
        reference,
        purpose: payment.purpose,
        courseId: null,
        enrollmentId: null,
        cardSaved,
        refundStatus,
      }
    }

    if (!payment.courseId)
      throw new ApplicationError('Course payment has no course', 'PAYMENT_MISMATCH', 409)
    const enrollment = await this.dependencies.participation.enroll({
      courseId: payment.courseId,
      studentId: payment.studentId,
      source: 'payment',
      invitationId: `PAYMENT-${payment.reference}`,
      paymentReference: payment.reference,
      enrolledAt: succeeded.paidAt ?? now,
    })
    return {
      status: 'success' as const,
      reference,
      purpose: payment.purpose,
      courseId: payment.courseId,
      enrollmentId: enrollment.id,
      cardSaved,
    }
  }

  private assertMatchingTransaction(payment: CoursePayment, transaction: VerifiedPayment): void {
    if (transaction.reference !== payment.reference)
      throw new ApplicationError('Payment reference does not match', 'PAYMENT_MISMATCH', 409)
    if (transaction.status !== 'success')
      throw new ApplicationError(
        'Payment has not completed successfully',
        'PAYMENT_NOT_SUCCESSFUL',
        409,
      )
    if (
      !Number.isSafeInteger(transaction.amountKobo) ||
      transaction.amountKobo !== payment.amountKobo
    )
      throw new ApplicationError(
        'Payment amount does not match the expected amount',
        'PAYMENT_MISMATCH',
        409,
      )
    if (transaction.currency !== payment.currency)
      throw new ApplicationError('Payment currency does not match', 'PAYMENT_MISMATCH', 409)
    if (
      !transaction.customerEmail ||
      transaction.customerEmail.toLowerCase() !== payment.customerEmail
    )
      throw new ApplicationError('Payment customer does not match', 'PAYMENT_MISMATCH', 409)
  }

  private async saveAuthorizationIfRequested(
    payment: CoursePayment,
    transaction: VerifiedPayment,
  ): Promise<boolean> {
    if (
      (!payment.requestedSaveMethod && !payment.selectedPaymentMethodId) ||
      !transaction.authorization
    )
      return false
    const authorization = transaction.authorization
    if (
      !authorization.reusable ||
      authorization.channel !== 'card' ||
      !authorization.authorizationCode ||
      !authorization.signature ||
      !authorization.last4
    )
      return false
    await this.dependencies.authorizations.upsert({
      studentId: payment.studentId,
      adapter: 'paystack',
      authorizationCodeEncrypted: this.dependencies.authorizationCipher.encrypt(
        authorization.authorizationCode,
      ),
      authorizationEmail: payment.customerEmail,
      signature: authorization.signature,
      channel: authorization.channel,
      cardType: authorization.cardType,
      brand: authorization.brand,
      last4: authorization.last4,
      expMonth: authorization.expMonth,
      expYear: authorization.expYear,
      bin: authorization.bin,
      bank: authorization.bank,
      countryCode: authorization.countryCode,
      accountName: authorization.accountName,
      reusable: authorization.reusable,
      disabledAt: null,
    })
    return true
  }

  private async refundCardSetup(payment: CoursePayment): Promise<string> {
    if (!(await this.dependencies.payments.claimRefund(payment.reference)))
      return payment.refundStatus ?? 'requested'
    try {
      const refund = await this.dependencies.gateway.refund(payment.reference, payment.amountKobo)
      const status = ['pending', 'processing', 'processed'].includes(refund.status)
        ? (refund.status as 'pending' | 'processing' | 'processed')
        : 'pending'
      await this.dependencies.payments.markRefundStatus(payment.reference, status)
      return status
    } catch {
      await this.dependencies.payments.markRefundStatus(payment.reference, 'failed')
      return 'failed'
    }
  }

  private newPayment(input: {
    reference: string
    activeKey: string
    purpose: CoursePayment['purpose']
    courseId: string | null
    student: Student
    amountKobo: number
    requestedSaveMethod: boolean
    selectedPaymentMethodId: string | null
  }): CreateCoursePayment {
    return {
      reference: input.reference,
      activeKey: input.activeKey,
      purpose: input.purpose,
      courseId: input.courseId,
      studentId: input.student.id,
      customerEmail: input.student.email.toLowerCase(),
      amountKobo: input.amountKobo,
      currency: 'NGN',
      adapter: 'paystack',
      status: 'pending',
      requestedSaveMethod: input.requestedSaveMethod,
      selectedPaymentMethodId: input.selectedPaymentMethodId,
      authorizationUrl: null,
      accessCode: null,
      failureReason: null,
      providerTransactionId: null,
      providerReceiptNumber: null,
      providerEnvironment: null,
      paymentMethod: null,
      gatewayResponse: null,
      gatewayResponseCode: null,
      processorResponseCode: null,
      feesKobo: null,
      requestedAmountKobo: null,
      customerCode: null,
      bankName: null,
      accountName: null,
      cardBrand: null,
      cardType: null,
      cardLast4: null,
      cardExpMonth: null,
      cardExpYear: null,
      authorizationSignature: null,
      countryCode: null,
      providerCreatedAt: null,
      paidAt: null,
      verifiedAt: null,
      verifiedBy: null,
      refundStatus: null,
    }
  }

  private resumeActivePayment(payment: CoursePayment) {
    if (payment.status === 'initialized' && payment.authorizationUrl && payment.accessCode)
      return checkoutResponse(payment)
    throw new ApplicationError(
      'A payment is already being initialized. Please try again.',
      'PAYMENT_INITIALIZATION_IN_PROGRESS',
      409,
    )
  }

  private async paymentMethod(student: Student, id: string): Promise<PaymentAuthorization> {
    const method = await this.dependencies.authorizations.findById(student.id, id)
    if (!method || !method.reusable)
      throw new ApplicationError(
        'Saved payment method was not found',
        'PAYMENT_METHOD_NOT_FOUND',
        404,
      )
    return method
  }

  private async failInitialization(reference: string, error: unknown): Promise<void> {
    await this.dependencies.payments
      .markInitializationFailed(
        reference,
        error instanceof Error ? error.message : 'Paystack initialization failed',
      )
      .catch(() => undefined)
    await this.dependencies.notifications.publish({
      title: 'Payment initialization failed',
      body: `Payment ${reference} could not be initialized: ${
        error instanceof Error ? error.message : 'Paystack initialization failed'
      }`,
      link: '/courses',
    })
  }

  private assertPaymentSecurity(student: Student): void {
    if (!student.twoFactorEnabled)
      throw new ApplicationError(
        'Two-factor setup is required before payment',
        'TWO_FACTOR_SETUP_REQUIRED',
        403,
      )
  }

  private assertCallbackUrl(value: string): string {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      throw new ApplicationError(
        'Callback URL must be a valid absolute URL',
        'INVALID_CALLBACK_URL',
        400,
      )
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      throw new ApplicationError('Callback URL must use http or https', 'INVALID_CALLBACK_URL', 400)
    return url.toString().replace(/\/$/, '')
  }

  private async availablePaidCourse(courseId: string) {
    const aggregate = await this.dependencies.courses.findById(courseId)
    if (!aggregate) throw new ApplicationError('Course not found', 'COURSE_NOT_FOUND', 404)
    if (aggregate.course.scheduledAt && aggregate.course.scheduledAt.getTime() > Date.now())
      throw new ApplicationError(
        `Course will be available on ${aggregate.course.scheduledAt.toISOString()}`,
        'COURSE_NOT_AVAILABLE',
        403,
      )
    if (aggregate.course.accessType !== 'paid' || aggregate.course.priceKobo < 1)
      throw new ApplicationError('This course does not require payment', 'COURSE_IS_FREE', 409)
    return aggregate.course
  }
}

const publicMethod = (method: PaymentAuthorization) => ({
  id: method.id,
  adapter: method.adapter,
  channel: method.channel,
  cardType: method.cardType,
  brand: method.brand,
  last4: method.last4,
  expMonth: method.expMonth,
  expYear: method.expYear,
  bank: method.bank,
  countryCode: method.countryCode,
  accountName: method.accountName,
  createdAt: method.createdAt,
  updatedAt: method.updatedAt,
})

const publicTransaction = (payment: CoursePayment) => ({
  id: payment.id,
  reference: payment.reference,
  purpose: payment.purpose ?? 'course_purchase',
  courseId: payment.courseId,
  amountKobo: payment.amountKobo,
  currency: payment.currency,
  adapter: payment.adapter ?? 'paystack',
  status: payment.status,
  paymentMethod: payment.paymentMethod,
  gatewayResponse: payment.gatewayResponse,
  feesKobo: payment.feesKobo,
  bankName: payment.bankName,
  accountName: payment.accountName,
  cardBrand: payment.cardBrand,
  cardType: payment.cardType,
  cardLast4: payment.cardLast4,
  countryCode: payment.countryCode,
  refundStatus: payment.refundStatus,
  paidAt: payment.paidAt,
  createdAt: payment.createdAt,
})

const providerError = (message: string) =>
  new ApplicationError(message, 'PAYMENT_PROVIDER_ERROR', 502)

const checkoutResponse = (payment: CoursePayment) => ({
  status: 'initialized' as const,
  reference: payment.reference,
  authorizationUrl: payment.authorizationUrl,
  accessCode: payment.accessCode,
  purpose: payment.purpose ?? 'course_purchase',
})
