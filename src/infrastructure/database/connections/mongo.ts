import mongoose from 'mongoose'
import type { LifecycleService } from '../../../entities/interfaces/services'
import type { Logger } from '../../../entities/interfaces/logger'
import type { EnvironmentConfig } from '../../config/environment'

export class MongoDBConnection implements LifecycleService {
  private readonly minPoolSize = 3
  private readonly maxPoolSize = 20
  private readonly connectionTimeoutMs = 10_000
  private readonly socketTimeoutMs = 45_000
  private listenersAttached = false

  constructor(
    config: EnvironmentConfig,
    private readonly logger: Logger,
  ) {
    this.uri = config.MONGODB_URI
  }

  private readonly uri: string

  async connect(): Promise<void> {
    if (mongoose.connection.readyState === 1) {
      this.logger.debug({ database: 'mongodb' }, 'MongoDB is already connected')
      return
    }

    this.attachListeners()

    await mongoose.connect(this.uri, {
      maxPoolSize: this.maxPoolSize,
      minPoolSize: this.minPoolSize,
      maxIdleTimeMS: this.connectionTimeoutMs,
      waitQueueTimeoutMS: this.connectionTimeoutMs,
      serverSelectionTimeoutMS: this.connectionTimeoutMs,
      connectTimeoutMS: this.connectionTimeoutMs,
      socketTimeoutMS: this.socketTimeoutMs,
      autoIndex: true,
    })

    this.logger.info(
      {
        database: 'mongodb',
        maxPoolSize: this.maxPoolSize,
        minPoolSize: this.minPoolSize,
        connectionTimeoutMs: this.connectionTimeoutMs,
        socketTimeoutMs: this.socketTimeoutMs,
      },
      'MongoDB connected',
    )
  }

  async disconnect(): Promise<void> {
    if (mongoose.connection.readyState === 0) {
      return
    }

    await mongoose.disconnect()
    this.logger.info({ database: 'mongodb' }, 'MongoDB connection closed')
  }

  private attachListeners(): void {
    if (this.listenersAttached) {
      return
    }

    mongoose.connection.on('disconnected', () => {
      this.logger.warn({ database: 'mongodb' }, 'MongoDB disconnected')
    })
    mongoose.connection.on('reconnected', () => {
      this.logger.info({ database: 'mongodb' }, 'MongoDB reconnected')
    })
    mongoose.connection.on('error', (error: Error) => {
      this.logger.error({ err: error, database: 'mongodb' }, 'MongoDB connection error')
    })
    this.listenersAttached = true
  }
}
