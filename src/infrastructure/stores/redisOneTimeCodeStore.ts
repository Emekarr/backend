import type { OneTimeCodePurpose, OneTimeCodeStore } from '../../entities/interfaces/auth'
import type { RedisDBConnection } from '../database/connections/redis'

const CONSUME_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current and current == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return 1
end
return 0
`

export class RedisOneTimeCodeStore implements OneTimeCodeStore {
  constructor(private readonly connection: RedisDBConnection) {}

  async store(
    purpose: OneTimeCodePurpose,
    subject: string,
    valueHash: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.connection.client.set(this.key(purpose, subject), valueHash, {
      expiration: { type: 'EX', value: ttlSeconds },
    })
  }

  async consume(purpose: OneTimeCodePurpose, subject: string, valueHash: string): Promise<boolean> {
    const result = await this.connection.client.eval(CONSUME_SCRIPT, {
      keys: [this.key(purpose, subject)],
      arguments: [valueHash],
    })

    return result === 1
  }

  private key(purpose: OneTimeCodePurpose, subject: string): string {
    return `auth:${purpose}:${subject}`
  }
}
