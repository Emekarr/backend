import type { RateLimiter } from '../../entities/interfaces/auth'
import type { RedisDBConnection } from '../database/connections/redis'

const CONSUME_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`

export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly connection: RedisDBConnection) {}

  async consume(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const count = await this.connection.client.eval(CONSUME_SCRIPT, {
      keys: [`rate-limit:${key}`],
      arguments: [String(windowSeconds)],
    })

    return typeof count === 'number' && count <= limit
  }
}
