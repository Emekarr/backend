import { createClientPool } from 'redis'
import type { Logger } from '../../../entities/interfaces/logger'
import type { LifecycleService } from '../../../entities/interfaces/services'
import type { EnvironmentConfig } from '../../config/environment'

const buildRedisPool = (
  uri: string,
  minPoolSize: number,
  maxPoolSize: number,
  connectionTimeoutMs: number,
  logger: Logger,
) =>
  createClientPool(
    {
      url: uri,
      socket: {
        connectTimeout: connectionTimeoutMs,
        reconnectStrategy: (retries) => {
          if (retries >= 5) {
            return new Error('Redis reconnect limit reached')
          }

          const delayMs = Math.min(100 * 2 ** retries, 3_000)
          logger.warn({ database: 'redis', retries, delayMs }, 'Redis reconnect scheduled')
          return delayMs
        },
      },
    },
    {
      minimum: minPoolSize,
      maximum: maxPoolSize,
      acquireTimeout: connectionTimeoutMs,
    },
  )

export type RedisPool = ReturnType<typeof buildRedisPool>

export class RedisDBConnection implements LifecycleService {
  private readonly minPoolSize = 1
  private readonly maxPoolSize = 1
  private readonly connectionTimeoutMs = 10_000
  private pool?: RedisPool
  private connectionPromise?: Promise<void>

  constructor(
    config: EnvironmentConfig,
    private readonly logger: Logger,
  ) {
    this.uri = config.REDIS_URI
  }

  private readonly uri: string

  get client(): RedisPool {
    if (!this.pool?.isOpen) {
      throw new Error('Redis is not connected')
    }

    return this.pool
  }

  async connect(): Promise<void> {
    if (this.pool?.isOpen) {
      this.logger.debug({ database: 'redis' }, 'Redis is already connected')
      return
    }

    this.connectionPromise ??= this.openConnection()

    try {
      await this.connectionPromise
    } finally {
      this.connectionPromise = undefined
    }
  }

  async disconnect(): Promise<void> {
    const pool = this.pool

    if (!pool) {
      return
    }

    if (pool.isOpen && !pool.isClosing) {
      await pool.close()
    }

    this.pool = undefined
    this.logger.info({ database: 'redis' }, 'Redis connection closed')
  }

  private async openConnection(): Promise<void> {
    const pool = this.createPool()
    this.pool = pool

    try {
      await pool.connect()
      await pool.ping()
    } catch (error) {
      if (pool.isOpen) {
        pool.destroy()
      }
      this.pool = undefined
      throw error
    }

    this.logger.info(
      {
        database: 'redis',
        maxPoolSize: this.maxPoolSize,
        minPoolSize: this.minPoolSize,
        connectionTimeoutMs: this.connectionTimeoutMs,
      },
      'Redis connected',
    )
  }

  private createPool(): RedisPool {
    const pool = buildRedisPool(
      this.uri,
      this.minPoolSize,
      this.maxPoolSize,
      this.connectionTimeoutMs,
      this.logger,
    )

    pool.on('error', (error: Error) => {
      this.logger.error({ err: error, database: 'redis' }, 'Redis connection error')
    })

    return pool
  }
}
