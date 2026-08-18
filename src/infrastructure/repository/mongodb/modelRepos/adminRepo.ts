import type { QueryFilter, UpdateQuery } from 'mongoose'
import type { AdminRepository } from '../../../../entities/interfaces/adminRepository'
import type { Admin, CreateAdmin } from '../../../../entities/models/Admin'
import { DefaultRepository } from '../../index'
import { AdminSchema } from '../models/Admin'

export class AdminRepo extends DefaultRepository<Admin, CreateAdmin> implements AdminRepository {
  constructor() {
    super('Admin', AdminSchema)
  }

  async findByEmailForAuthentication(email: string): Promise<Admin | null> {
    const document = await this.model
      .findOne({ email: email.toLowerCase() } as QueryFilter<Admin>)
      .select(
        '+password +twoFactorSecretEncrypted +pendingTwoFactorSecretEncrypted +lastTwoFactorTimeStep',
      )
      .lean()
      .exec()

    return document ? this.toEntity(document as unknown as Record<string, unknown>) : null
  }

  async consumeTwoFactorTimeStep(
    adminId: string,
    timeStep: number,
    changes: Partial<Admin> = {},
  ): Promise<Admin | null> {
    const document = await this.model
      .findOneAndUpdate(
        {
          id: adminId,
          $or: [{ lastTwoFactorTimeStep: null }, { lastTwoFactorTimeStep: { $lt: timeStep } }],
        } as QueryFilter<Admin>,
        {
          $set: { ...changes, lastTwoFactorTimeStep: timeStep },
        } as UpdateQuery<Admin>,
        { new: true, runValidators: true },
      )
      .select('+twoFactorSecretEncrypted +lastTwoFactorTimeStep')
      .lean()
      .exec()

    return document ? this.toEntity(document as unknown as Record<string, unknown>) : null
  }
}

export default AdminRepo
