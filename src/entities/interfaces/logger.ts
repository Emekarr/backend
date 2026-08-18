export type LogContext = Record<string, unknown>

export interface LogMethod {
  (message: string): void
  (context: LogContext, message: string): void
}

export interface Logger {
  info: LogMethod
  error: LogMethod
  warn: LogMethod
  debug: LogMethod
}
