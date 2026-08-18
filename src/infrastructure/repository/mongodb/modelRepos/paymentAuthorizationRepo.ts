import mongoose, { type Model } from 'mongoose'
import type { PaymentAuthorizationRepository } from '../../../../entities/interfaces/paymentAuthorizationRepository'
import type { PaymentAuthorization } from '../../../../entities/models/PaymentAuthorization'
import { generateID } from '../../../identifiers/generators'
import { PaymentAuthorizationSchema } from '../models/PaymentAuthorization'

export class PaymentAuthorizationRepo implements PaymentAuthorizationRepository {
  private readonly authorizations: Model<PaymentAuthorization> =
    (mongoose.models.PaymentAuthorization as Model<PaymentAuthorization> | undefined) ??
    mongoose.model('PaymentAuthorization', PaymentAuthorizationSchema)

  async upsert(
    input: Parameters<PaymentAuthorizationRepository['upsert']>[0],
  ): Promise<PaymentAuthorization> {
    const value = await this.authorizations
      .findOneAndUpdate(
        { studentId: input.studentId, signature: input.signature },
        { $set: { ...input, disabledAt: null }, $setOnInsert: { id: generateID() } },
        { upsert: true, new: true, runValidators: true },
      )
      .lean()
      .exec()
    return clean(value)
  }

  async findById(studentId: string, id: string): Promise<PaymentAuthorization | null> {
    const value = await this.authorizations
      .findOne({ id, studentId, disabledAt: null })
      .lean()
      .exec()
    return value ? clean(value) : null
  }

  async listForStudent(studentId: string): Promise<PaymentAuthorization[]> {
    const values = await this.authorizations
      .find({ studentId, disabledAt: null, reusable: true })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean()
      .exec()
    return values.map(clean)
  }

  async disable(studentId: string, id: string, disabledAt: Date): Promise<void> {
    await this.authorizations.updateOne(
      { id, studentId, disabledAt: null },
      { $set: { disabledAt } },
    )
  }
}

const clean = (value: unknown): PaymentAuthorization => {
  const { _id: _id, __v: _version, ...result } = value as Record<string, unknown>
  return result as unknown as PaymentAuthorization
}
