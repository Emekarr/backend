import type { Logger } from './entities/interfaces/logger'
import type { LifecycleService } from './entities/interfaces/services'

export interface ServiceManager {
  start(): Promise<void>
  stop(): Promise<void>
}

export const createServiceManager = (
  services: readonly LifecycleService[],
  logger: Logger,
): ServiceManager => ({
  async start(): Promise<void> {
    const started: LifecycleService[] = []

    try {
      for (const service of services) {
        await service.connect()
        started.push(service)
      }
    } catch (error) {
      logger.error({ err: error }, 'A data service failed to start')
      await Promise.allSettled(started.reverse().map((service) => service.disconnect()))
      throw error
    }

    logger.info('All data services started')
  },

  async stop(): Promise<void> {
    const results = await Promise.allSettled(
      [...services].reverse().map((service) => service.disconnect()),
    )
    const errors = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason as unknown)

    if (errors.length > 0) {
      logger.error({ errors }, 'One or more data services failed to stop')
      throw new AggregateError(errors, 'One or more data services failed to stop')
    }

    logger.info('All data services stopped')
  },
})
