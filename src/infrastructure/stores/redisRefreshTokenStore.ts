import type {
  RefreshTokenRecord,
  RefreshTokenRotation,
  RefreshTokenStore,
} from '../../entities/interfaces/auth'
import type { RedisDBConnection } from '../database/connections/redis'

const ROTATE_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current then
  local ttl = redis.call('TTL', KEYS[1])
  if ttl < 1 then return { 'missing' } end
  local record = cjson.decode(current)
  local sessionKey = 'auth:refresh:session:' .. record.sessionId
  redis.call('DEL', KEYS[1])
  redis.call('SET', KEYS[2], current, 'EX', ttl)
  redis.call('SET', sessionKey, ARGV[1], 'EX', ttl)
  redis.call('SET', KEYS[3], current, 'EX', ttl)
  return { 'rotated', current }
end

local used = redis.call('GET', KEYS[2])
if used then
  local record = cjson.decode(used)
  local sessionKey = 'auth:refresh:session:' .. record.sessionId
  local activeHash = redis.call('GET', sessionKey)
  if activeHash then redis.call('DEL', ARGV[2] .. activeHash) end
  redis.call('DEL', sessionKey)
  return { 'reused', used }
end

return { 'missing' }
`

const REVOKE_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local record = cjson.decode(current)
redis.call('DEL', KEYS[1])
redis.call('DEL', KEYS[2])
return 1
`

export class RedisRefreshTokenStore implements RefreshTokenStore {
  constructor(private readonly connection: RedisDBConnection) {}

  async create(tokenHash: string, record: RefreshTokenRecord, ttlSeconds: number): Promise<void> {
    const value = JSON.stringify(record)
    await this.connection.client.set(this.tokenKey(tokenHash), value, {
      expiration: { type: 'EX', value: ttlSeconds },
    })
    await this.connection.client.set(this.sessionKey(record.sessionId), tokenHash, {
      expiration: { type: 'EX', value: ttlSeconds },
    })
  }

  async rotate(tokenHash: string, nextTokenHash: string): Promise<RefreshTokenRotation> {
    const result = await this.connection.client.eval(ROTATE_SCRIPT, {
      keys: [this.tokenKey(tokenHash), this.usedKey(tokenHash), this.tokenKey(nextTokenHash)],
      arguments: [nextTokenHash, this.tokenKeyPrefix()],
    })
    return this.parseRotation(result)
  }

  async revoke(tokenHash: string): Promise<void> {
    const value = await this.connection.client.get(this.tokenKey(tokenHash))
    if (!value) return
    const record = this.parseRecord(value)
    await this.connection.client.eval(REVOKE_SCRIPT, {
      keys: [this.tokenKey(tokenHash), this.sessionKey(record.sessionId)],
      arguments: [],
    })
  }

  private parseRotation(result: unknown): RefreshTokenRotation {
    if (!Array.isArray(result) || typeof result[0] !== 'string') return { status: 'missing' }
    if (result[0] === 'missing') return { status: 'missing' }
    if ((result[0] !== 'rotated' && result[0] !== 'reused') || typeof result[1] !== 'string')
      return { status: 'missing' }
    return { status: result[0], record: this.parseRecord(result[1]) }
  }

  private parseRecord(value: string): RefreshTokenRecord {
    const parsed = JSON.parse(value) as Partial<RefreshTokenRecord>
    if (
      typeof parsed.sessionId !== 'string' ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.tokenVersion !== 'number' ||
      (parsed.role !== 'admin' && parsed.role !== 'author' && parsed.role !== 'student')
    ) {
      throw new Error('Invalid refresh-token record in Redis')
    }
    return parsed as RefreshTokenRecord
  }

  private tokenKey(tokenHash: string): string {
    return `${this.tokenKeyPrefix()}${tokenHash}`
  }

  private tokenKeyPrefix(): string {
    return 'auth:refresh:token:'
  }

  private usedKey(tokenHash: string): string {
    return `auth:refresh:used:${tokenHash}`
  }

  private sessionKey(sessionId: string): string {
    return `auth:refresh:session:${sessionId}`
  }
}
