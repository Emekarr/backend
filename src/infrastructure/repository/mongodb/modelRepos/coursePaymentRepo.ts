import mongoose, { type Model } from 'mongoose'
import type { CoursePaymentRepository } from '../../../../entities/interfaces/coursePaymentRepository'
import type { CoursePayment } from '../../../../entities/models/CoursePayment'
import { CoursePaymentSchema } from '../models/CoursePayment'

export class CoursePaymentRepo implements CoursePaymentRepository {
  private readonly payments: Model<CoursePayment> =
    (mongoose.models.CoursePayment as Model<CoursePayment> | undefined) ??
    mongoose.model('CoursePayment', CoursePaymentSchema)

  async createOrFindActive(
    input: Parameters<CoursePaymentRepository['createOrFindActive']>[0],
  ): Promise<CoursePayment> {
    if (!input.activeKey) throw new Error('An active payment key is required')
    const payment = await this.payments
      .findOneAndUpdate(
        { activeKey: input.activeKey },
        { $setOnInsert: input },
        { upsert: true, new: true, runValidators: true },
      )
      .lean()
      .exec()
    return clean<CoursePayment>(payment)
  }

  async findByReference(reference: string): Promise<CoursePayment | null> {
    const payment = await this.payments.findOne({ reference }).lean().exec()
    return payment ? clean<CoursePayment>(payment) : null
  }

  async listForStudent(studentId: string, limit: number): Promise<CoursePayment[]> {
    const payments = await this.payments
      .find({ studentId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec()
    return payments.map((payment) => clean<CoursePayment>(payment))
  }

  async markInitialized(
    reference: string,
    input: { authorizationUrl: string; accessCode: string },
  ): Promise<CoursePayment> {
    const payment = await this.payments
      .findOneAndUpdate(
        { reference, status: { $in: ['pending', 'initialized'] } },
        { $set: { ...input, status: 'initialized', failureReason: null } },
        { new: true, runValidators: true },
      )
      .lean()
      .exec()
    if (!payment) throw new Error('Payment initialization record was not found')
    return clean<CoursePayment>(payment)
  }

  async markInitializationFailed(reference: string, reason: string): Promise<void> {
    await this.payments.updateOne(
      { reference, status: 'pending' },
      {
        $set: { status: 'failed', failureReason: reason.slice(0, 500) },
        $unset: { activeKey: 1 },
      },
    )
  }

  async markSucceeded(
    reference: string,
    input: Parameters<CoursePaymentRepository['markSucceeded']>[1],
  ): Promise<CoursePayment> {
    const transaction = input.transaction
    const payment = await this.payments
      .findOneAndUpdate(
        { reference },
        {
          $set: {
            status: 'succeeded',
            paidAt: input.paidAt,
            verifiedAt: input.verifiedAt,
            verifiedBy: input.verifiedBy,
            providerTransactionId: transaction.providerTransactionId,
            providerReceiptNumber: transaction.providerReceiptNumber,
            providerEnvironment: transaction.providerEnvironment,
            paymentMethod: transaction.paymentMethod,
            gatewayResponse: transaction.gatewayResponse,
            gatewayResponseCode: transaction.gatewayResponseCode,
            processorResponseCode: transaction.processorResponseCode,
            feesKobo: transaction.feesKobo,
            requestedAmountKobo: transaction.requestedAmountKobo,
            customerCode: transaction.customerCode,
            bankName: transaction.bankName,
            accountName: transaction.accountName,
            cardBrand: transaction.cardBrand,
            cardType: transaction.cardType,
            cardLast4: transaction.cardLast4,
            cardExpMonth: transaction.authorization?.expMonth ?? null,
            cardExpYear: transaction.authorization?.expYear ?? null,
            authorizationSignature: transaction.authorization?.signature ?? null,
            countryCode: transaction.countryCode,
            providerCreatedAt: transaction.providerCreatedAt,
          },
          $unset: { failureReason: 1, activeKey: 1, authorizationUrl: 1, accessCode: 1 },
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec()
    if (!payment) throw new Error('Payment record was not found')
    return clean<CoursePayment>(payment)
  }

  async listByCourseIds(courseIds: string[], limit: number): Promise<CoursePayment[]> {
    if (!courseIds.length) return []
    const payments = await this.payments
      .find({ courseId: { $in: courseIds } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec()
    return payments.map((payment) => clean<CoursePayment>(payment))
  }

  async claimRefund(reference: string): Promise<boolean> {
    const result = await this.payments.updateOne(
      { reference, refundStatus: null },
      { $set: { refundStatus: 'requesting' } },
    )
    return result.modifiedCount === 1
  }

  async markRefundStatus(
    reference: string,
    status: NonNullable<CoursePayment['refundStatus']>,
  ): Promise<void> {
    await this.payments.updateOne({ reference }, { $set: { refundStatus: status } })
  }
}

const clean = <T>(value: unknown): T => {
  const { _id: _id, __v: _version, ...result } = value as Record<string, unknown>
  return result as T
}
