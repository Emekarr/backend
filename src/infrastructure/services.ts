import { diContainer } from './container'
import { DI_TOKENS } from './di/tokens'

export const hashPassword = (password: string): Promise<string> =>
  diContainer.get(DI_TOKENS.passwordHasher).hash(password)
