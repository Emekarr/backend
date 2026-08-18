import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { SecretCipher } from '../../entities/interfaces/auth'

export class AesSecretCipher implements SecretCipher {
  private readonly key: Buffer

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, 'base64')
    if (this.key.length !== 32) {
      throw new Error('AES secret cipher requires a 32-byte key')
    }
  }

  encrypt(value: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()

    return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`
  }

  decrypt(value: string): string {
    const [version, ivValue, tagValue, ciphertextValue, ...extra] = value.split(':')
    if (version !== 'v1' || !ivValue || !tagValue || !ciphertextValue || extra.length > 0) {
      throw new Error('Encrypted secret has an invalid format')
    }

    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivValue, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  }
}
