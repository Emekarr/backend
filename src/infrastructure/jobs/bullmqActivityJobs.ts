import { Queue, Worker, type Job } from 'bullmq'
import IORedis from 'ioredis'
import type { ActivityRepository } from '../../entities/interfaces/activityRepository'
import type { Logger } from '../../entities/interfaces/logger'
import type { ActivityJobQueue, LifecycleService } from '../../entities/interfaces/services'
import type { CreateUserActivity } from '../../entities/models/UserActivity'
import type { EnvironmentConfig } from '../config/environment'

export class BullMQActivityJobs implements ActivityJobQueue, LifecycleService {
  private queue?: Queue<CreateUserActivity>
  private worker?: Worker<CreateUserActivity>
  private producerConnection?: IORedis
  private workerConnection?: IORedis
  private readonly queueName: string
  private readonly redisUri: string

  constructor(
    config: EnvironmentConfig,
    private readonly activities: ActivityRepository,
    private readonly logger: Logger,
  ) {
    this.queueName = `${config.SERVICE_NAME.replace(/[^a-zA-Z0-9_-]/g, '-')}-activities`
    this.redisUri = config.REDIS_URI
  }

  async connect(): Promise<void> {
    if (this.queue || this.worker) return

    this.producerConnection = new IORedis(this.redisUri, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    })
    this.workerConnection = new IORedis(this.redisUri, { maxRetriesPerRequest: null })
    this.queue = new Queue(this.queueName, {
      connection: this.producerConnection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 500 },
        removeOnComplete: 2_000,
        removeOnFail: 5_000,
      },
    })
    this.worker = new Worker(this.queueName, (job) => this.process(job), {
      connection: this.workerConnection,
      concurrency: 10,
    })
    this.queue.on('error', (error) =>
      this.logger.error({ err: error, queue: this.queueName }, 'Activity queue error'),
    )
    this.worker.on('error', (error) =>
      this.logger.error({ err: error, queue: this.queueName }, 'Activity worker error'),
    )
    this.worker.on('failed', (job, error) =>
      this.logger.error(
        { err: error, queue: this.queueName, jobId: job?.id },
        'Activity job failed',
      ),
    )
    this.worker.on('completed', (job) =>
      this.logger.debug(
        { queue: this.queueName, jobId: job.id, action: job.data.action },
        'Activity job persisted',
      ),
    )
    await Promise.all([this.queue.waitUntilReady(), this.worker.waitUntilReady()])
    this.logger.info({ queue: this.queueName }, 'BullMQ activity queue and worker started')
  }

  async disconnect(): Promise<void> {
    await this.worker?.close()
    await this.queue?.close()
    await this.workerConnection?.quit()
    await this.producerConnection?.quit()
    this.worker = undefined
    this.queue = undefined
    this.workerConnection = undefined
    this.logger.info({ queue: this.queueName }, 'BullMQ activity queue and worker stopped')
    this.producerConnection = undefined
  }

  async enqueue(activity: CreateUserActivity): Promise<void> {
    if (!this.queue) throw new Error('Activity queue is not started')
    const job = await this.queue.add('record-activity', activity)
    this.logger.debug(
      {
        queue: this.queueName,
        jobId: job.id,
        action: activity.action,
        statusCode: activity.statusCode,
      },
      'Activity job queued',
    )
  }

  private async process(job: Job<CreateUserActivity>): Promise<void> {
    this.logger.debug(
      { queue: this.queueName, jobId: job.id, action: job.data.action },
      'Persisting activity job',
    )
    await this.activities.create(job.data)
  }
}
