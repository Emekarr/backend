import { createHmac, randomBytes, randomInt } from 'node:crypto'
import type { SecureTokenGenerator } from '../../entities/interfaces/auth'

export class NodeSecureTokenGenerator implements SecureTokenGenerator {
  constructor(private readonly pepper: string) {}

  numericCode(digits: number): string {
    const maximum = 10 ** digits
    return randomInt(0, maximum).toString().padStart(digits, '0')
  }

  token(bytes: number): string {
    return randomBytes(bytes).toString('base64url')
  }

  hash(value: string): string {
    return createHmac('sha256', this.pepper).update(value).digest('hex')
  }
}
