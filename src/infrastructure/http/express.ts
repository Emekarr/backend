import type { Server } from 'node:http'
import cors from 'cors'
import express, { type Express, type RequestHandler, type Router } from 'express'
import { ApplicationError } from '../../entities/errors/applicationError'
import { validateQuery } from '../validation/joi'
import type { Logger } from '../../entities/interfaces/logger'
import type { HttpServer } from '../../entities/interfaces/services'
import type { EnvironmentConfig } from '../config/environment'
import { installResponseEnvelope } from './responseEnvelope'

export class ExpressServer implements HttpServer {
  readonly app: Express
  private listener?: Server
  private readonly options: { port: number; allowedOrigins: string[] }

  constructor(
    config: EnvironmentConfig,
    private readonly logger: Logger,
    private readonly requestMiddleware: readonly RequestHandler[] = [],
    private readonly routers: readonly Router[] = [],
  ) {
    this.options = { port: config.PORT, allowedOrigins: config.ALLOWED_ORIGINS }
    this.app = express()
    this.configure()
  }

  async start(): Promise<void> {
    if (this.listener) {
      throw new Error('Express server is already running')
    }

    await new Promise<void>((resolve, reject) => {
      const listener = this.app.listen(this.options.port, () => {
        listener.off('error', reject)
        this.listener = listener
        this.logger.info({ port: this.options.port }, 'Express server listening')
        resolve()
      })

      listener.once('error', reject)
    })
  }

  async stop(): Promise<void> {
    const listener = this.listener

    if (!listener) {
      return
    }

    await new Promise<void>((resolve, reject) => {
      listener.close((error) => {
        if (error) {
          reject(error)
          return
        }

        this.listener = undefined
        this.logger.info('Express server stopped')
        resolve()
      })
    })
  }

  private configure(): void {
    this.app.disable('x-powered-by')
    this.app.use(
      cors({
        origin: this.options.allowedOrigins.length > 0 ? this.options.allowedOrigins : true,
        credentials: true,
      }),
    )
    this.app.use((_request, response, next) => {
      installResponseEnvelope(response)
      next()
    })
    for (const middleware of this.requestMiddleware) {
      this.app.use(middleware)
    }
    this.app.use(
      express.json({
        limit: '1mb',
        verify: (request, _response, buffer) => {
          Object.assign(request, { rawBody: Buffer.from(buffer) })
        },
      }),
    )
    this.app.use(express.urlencoded({ extended: true, limit: '1mb' }))

    this.app.get('/health', validateQuery(), (_request, response) => {
      response.status(200).json({ status: 'ok', service: 'reelay' })
    })

    for (const router of this.routers) {
      this.app.use(router)
    }

    this.app.use((request, response) => {
      response.status(404).json({
        error: {
          code: 'ENDPOINT_NOT_FOUND',
          message: `Endpoint not found: ${request.method} ${request.url}`,
        },
      })
    })

    this.app.use(
      (
        error: unknown,
        _request: express.Request,
        response: express.Response,
        _next: express.NextFunction,
      ) => {
        if (error instanceof ApplicationError) {
          response
            .status(error.statusCode)
            .json({ error: { code: error.code, message: error.message } })
          return
        }

        if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
          response.status(400).json({
            error: { code: 'INVALID_JSON', message: 'Request body contains invalid JSON' },
          })
          return
        }

        this.logger.error({ err: error }, 'Unhandled HTTP request error')
        response.status(500).json({
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected error occurred',
          },
        })
      },
    )
  }
}
