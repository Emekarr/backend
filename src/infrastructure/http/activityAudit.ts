import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { randomUUID } from 'node:crypto'
import type { Logger } from '../../entities/interfaces/logger'
import type { ActivityJobQueue } from '../../entities/interfaces/services'
import type { ActivityActorType } from '../../entities/models/UserActivity'

interface ActivityContext {
  requestId?: string
  action?: string
  actorType?: ActivityActorType
  actorId?: string | null
  actorEmail?: string | null
  metadata?: Record<string, string | number | boolean | null>
}

const contexts = new WeakMap<Request, ActivityContext>()

export const setActivity = (request: Request, context: ActivityContext): void => {
  contexts.set(request, { ...contexts.get(request), ...context })
}

export const activityAudit =
  (queue: ActivityJobQueue, logger: Logger): RequestHandler =>
  (request: Request, response: Response, next: NextFunction): void => {
    const requestId = request.get('x-request-id')?.slice(0, 128) || randomUUID()
    const startedAt = performance.now()
    contexts.set(request, { requestId })
    response.setHeader('x-request-id', requestId)
    logger.info(
      {
        requestId,
        method: request.method,
        path: request.path,
        ipAddress: request.ip ?? null,
        userAgent: request.get('user-agent')?.slice(0, 500) ?? null,
        contentType: request.get('content-type') ?? null,
        contentLength: request.get('content-length') ?? null,
      },
      'HTTP request received',
    )
    response.once('finish', () => {
      const context = contexts.get(request) ?? {}
      const activity = {
        actorType: context.actorType ?? 'anonymous',
        actorId: context.actorId ?? null,
        actorEmail: context.actorEmail ?? null,
        action: (context.action ?? `${request.method.toLowerCase()} ${request.path}`).slice(0, 120),
        outcome: response.statusCode < 400 ? ('success' as const) : ('failure' as const),
        method: request.method,
        path: request.originalUrl.split('?')[0] ?? request.path,
        statusCode: response.statusCode,
        ipAddress: request.ip ?? null,
        userAgent: request.get('user-agent')?.slice(0, 500) ?? null,
        metadata: context.metadata ?? {},
      }
      logger.info(
        {
          requestId: context.requestId ?? requestId,
          method: activity.method,
          path: activity.path,
          action: activity.action,
          statusCode: activity.statusCode,
          outcome: activity.outcome,
          actorType: activity.actorType,
          actorId: activity.actorId,
          durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
          metadata: activity.metadata,
        },
        'HTTP request completed',
      )
      void queue
        .enqueue(activity)
        .catch((error) =>
          logger.error(
            { err: error, requestId: context.requestId ?? requestId, action: activity.action },
            'Failed to enqueue activity log',
          ),
        )
    })
    next()
  }
