import type { QueryFilter, UpdateQuery } from 'mongoose'
import type { StudentRepository } from '../../../../entities/interfaces/studentRepository'
import type { CreateStudent, Student } from '../../../../entities/models/Student'
import { DefaultRepository } from '../../index'
import { StudentSchema } from '../models/Student'

export class StudentRepo
  extends DefaultRepository<Student, CreateStudent>
  implements StudentRepository
{
  constructor() {
    super('Student', StudentSchema)
  }

  async findByEmailForAuthentication(email: string): Promise<Student | null> {
    const document = await this.model
      .findOne({ email: email.toLowerCase() } as QueryFilter<Student>)
      .select(
        '+password +twoFactorSecretEncrypted +pendingTwoFactorSecretEncrypted +lastTwoFactorTimeStep',
      )
      .lean()
      .exec()
    return document ? this.toEntity(document as unknown as Record<string, unknown>) : null
  }

  async consumeTwoFactorTimeStep(
    studentId: string,
    timeStep: number,
    changes: Partial<Student> = {},
  ): Promise<Student | null> {
    const document = await this.model
      .findOneAndUpdate(
        {
          id: studentId,
          $or: [{ lastTwoFactorTimeStep: null }, { lastTwoFactorTimeStep: { $lt: timeStep } }],
        } as QueryFilter<Student>,
        { $set: { ...changes, lastTwoFactorTimeStep: timeStep } } as UpdateQuery<Student>,
        { new: true, runValidators: true },
      )
      .select('+twoFactorSecretEncrypted +lastTwoFactorTimeStep')
      .lean()
      .exec()
    return document ? this.toEntity(document as unknown as Record<string, unknown>) : null
  }
}
