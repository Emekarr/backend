import type { Cache, CacheSetOptions } from '../../../entities/interfaces/database'
import type { RedisDBConnection } from '../connections/redis'

export class RedisCache implements Cache {
  constructor(private readonly connection: RedisDBConnection) {}

  async get<T>(key: string): Promise<T | null> {
    const value = await this.connection.client.get(key)

    return value === null ? null : (JSON.parse(value) as T)
  }

  async set<T>(key: string, value: T, options: CacheSetOptions = {}): Promise<boolean> {
    const result = await this.connection.client.set(key, JSON.stringify(value), {
      ...(options.ttlSeconds
        ? { expiration: { type: 'EX' as const, value: options.ttlSeconds } }
        : {}),
      ...(options.onlyIfAbsent ? { condition: 'NX' as const } : {}),
    })

    return result === 'OK'
  }

  async delete(key: string): Promise<boolean> {
    return (await this.connection.client.del(key)) > 0
  }

  async exists(key: string): Promise<boolean> {
    return (await this.connection.client.exists(key)) > 0
  }
}
