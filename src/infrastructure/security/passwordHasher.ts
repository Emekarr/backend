import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { PasswordHasher } from '../../entities/interfaces/services'

const scryptAsync = promisify(scrypt)

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex')
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer

    return `scrypt:${salt}:${derivedKey.toString('hex')}`
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    const [algorithm, salt, expectedHex, ...extra] = encodedHash.split(':')

    if (algorithm !== 'scrypt' || !salt || !expectedHex || extra.length > 0) {
      return false
    }

    try {
      const expected = Buffer.from(expectedHex, 'hex')
      const actual = (await scryptAsync(password, salt, expected.length)) as Buffer
      return expected.length > 0 && timingSafeEqual(actual, expected)
    } catch {
      return false
    }
  }
}
