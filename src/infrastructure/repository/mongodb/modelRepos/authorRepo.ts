import type { QueryFilter, UpdateQuery } from 'mongoose'
import type { AuthorRepository } from '../../../../entities/interfaces/authorRepository'
import type { Author, CreateAuthor } from '../../../../entities/models/Author'
import { DefaultRepository } from '../../index'
import { AuthorSchema } from '../models/Author'

export class AuthorRepo
  extends DefaultRepository<Author, CreateAuthor>
  implements AuthorRepository
{
  constructor() {
    super('Author', AuthorSchema)
  }

  async findByEmailForAuthentication(email: string): Promise<Author | null> {
    const document = await this.model
      .findOne({ email: email.toLowerCase() } as QueryFilter<Author>)
      .select(
        '+password +twoFactorSecretEncrypted +pendingTwoFactorSecretEncrypted +lastTwoFactorTimeStep',
      )
      .lean()
      .exec()
    return document ? this.toEntity(document as unknown as Record<string, unknown>) : null
  }

  async consumeTwoFactorTimeStep(
    authorId: string,
    timeStep: number,
    changes: Partial<Author> = {},
  ): Promise<Author | null> {
    const document = await this.model
      .findOneAndUpdate(
        {
          id: authorId,
          $or: [{ lastTwoFactorTimeStep: null }, { lastTwoFactorTimeStep: { $lt: timeStep } }],
        } as QueryFilter<Author>,
        { $set: { ...changes, lastTwoFactorTimeStep: timeStep } } as UpdateQuery<Author>,
        { new: true, runValidators: true },
      )
      .select('+twoFactorSecretEncrypted +lastTwoFactorTimeStep')
      .lean()
      .exec()
    return document ? this.toEntity(document as unknown as Record<string, unknown>) : null
  }
}

export default AuthorRepo
