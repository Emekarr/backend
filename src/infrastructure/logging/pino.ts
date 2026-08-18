import { hostname } from 'node:os'
import pino from 'pino'
import type { LogContext, Logger } from '../../entities/interfaces/logger'
import type { EnvironmentConfig } from '../config/environment'

export class PinoLogger implements Logger {
  private readonly logger: pino.Logger

  constructor(config: EnvironmentConfig) {
    this.logger = pino({
      name: config.SERVICE_NAME,
      level: config.LOG_LEVEL,
      timestamp: pino.stdTimeFunctions.isoTime,
      base: {
        service: config.SERVICE_NAME,
        environment: config.NODE_ENV,
        hostname: hostname(),
        pid: process.pid,
      },
      serializers: {
        err: pino.stdSerializers.err,
      },
      redact: {
        paths: [
          'password',
          '*.password',
          'currentPassword',
          '*.currentPassword',
          'newPassword',
          '*.newPassword',
          'code',
          '*.code',
          'secret',
          '*.secret',
          'authorizationCode',
          '*.authorizationCode',
          'authorization_code',
          '*.authorization_code',
          'authorizationCodeEncrypted',
          '*.authorizationCodeEncrypted',
          'accessCode',
          '*.accessCode',
          'card',
          '*.card',
          'token',
          '*.token',
          'authorization',
          '*.authorization',
          'req.headers.authorization',
        ],
        censor: '[REDACTED]',
      },
    })
  }

  info = (contextOrMessage: LogContext | string, message?: string): void => {
    this.write('info', contextOrMessage, message)
  }

  error = (contextOrMessage: LogContext | string, message?: string): void => {
    this.write('error', contextOrMessage, message)
  }

  warn = (contextOrMessage: LogContext | string, message?: string): void => {
    this.write('warn', contextOrMessage, message)
  }

  debug = (contextOrMessage: LogContext | string, message?: string): void => {
    this.write('debug', contextOrMessage, message)
  }

  private write(
    level: 'info' | 'error' | 'warn' | 'debug',
    contextOrMessage: LogContext | string,
    message?: string,
  ): void {
    if (typeof contextOrMessage === 'string') {
      this.logger[level](contextOrMessage)
      return
    }

    this.logger[level](contextOrMessage, message)
  }
}
