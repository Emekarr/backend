import type { Repository } from './database'
import type { Author, CreateAuthor } from '../models/Author'

export interface AuthorRepository extends Repository<Author, CreateAuthor> {
  findByEmailForAuthentication(email: string): Promise<Author | null>
  consumeTwoFactorTimeStep(
    authorId: string,
    timeStep: number,
    changes?: Partial<Author>,
  ): Promise<Author | null>
}
