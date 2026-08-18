import { config } from './config'
import { infrastructure } from './infrastructure/container'

const { logger, httpServer, startupService, serviceManager } = infrastructure
let shuttingDown = false

const bootstrapSuperAdmin = async (): Promise<void> => {
  const { SUPER_ADMIN_FIRST_NAME, SUPER_ADMIN_LAST_NAME, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD } =
    config

  if (
    !SUPER_ADMIN_FIRST_NAME ||
    !SUPER_ADMIN_LAST_NAME ||
    !SUPER_ADMIN_EMAIL ||
    !SUPER_ADMIN_PASSWORD
  ) {
    logger.warn('Super admin bootstrap skipped because its configuration is incomplete')
    return
  }

  await startupService.createSuperAdmin({
    firstName: SUPER_ADMIN_FIRST_NAME,
    lastName: SUPER_ADMIN_LAST_NAME,
    email: SUPER_ADMIN_EMAIL,
    password: SUPER_ADMIN_PASSWORD,
  })
}

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  logger.info({ signal }, 'Application shutdown started')

  try {
    await httpServer.stop()
    await serviceManager.stop()
    logger.info('Application shutdown completed')
  } catch (error) {
    logger.error({ err: error }, 'Application shutdown failed')
    process.exitCode = 1
  }
}

const initialize = async (): Promise<void> => {
  logger.debug({ environment: config.NODE_ENV }, 'Application initialization started')

  await serviceManager.start()
  await bootstrapSuperAdmin()
  await httpServer.start()

  logger.info('Application initialized successfully')
}

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))

void initialize().catch(async (error: unknown) => {
  logger.error({ err: error }, 'Application failed to initialize')
  process.exitCode = 1

  try {
    await httpServer.stop()
    await serviceManager.stop()
  } catch (shutdownError) {
    logger.error({ err: shutdownError }, 'Failed to clean up after startup error')
  }
})
