import type {
  CreatePaymentAuthorization,
  PaymentAuthorization,
} from '../models/PaymentAuthorization'

export interface PaymentAuthorizationRepository {
  upsert(input: CreatePaymentAuthorization): Promise<PaymentAuthorization>
  findById(studentId: string, id: string): Promise<PaymentAuthorization | null>
  listForStudent(studentId: string): Promise<PaymentAuthorization[]>
  disable(studentId: string, id: string, disabledAt: Date): Promise<void>
}
