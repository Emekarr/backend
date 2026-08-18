import type { Response } from 'express'

export interface ApiError {
  code: string
  details?: unknown
}

export type ApiResponse<T> =
  | { success: true; status: number; message: string; data: T; error: null }
  | { success: false; status: number; message: string; data: null; error: ApiError }

const successMessages: Record<number, string> = {
  200: 'Request completed successfully',
  201: 'Resource created successfully',
  202: 'Request accepted for processing',
}

const errorMessages: Record<number, string> = {
  400: 'The request is invalid',
  401: 'Authentication is required',
  403: 'Access is forbidden',
  404: 'The requested endpoint was not found',
  409: 'The request conflicts with the current state',
  415: 'The request content type is not supported',
  422: 'The request could not be processed',
  429: 'Too many requests',
  500: 'An unexpected error occurred',
  503: 'The service is temporarily unavailable',
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const isApiResponse = (value: unknown): value is ApiResponse<unknown> =>
  isObject(value) &&
  typeof value.success === 'boolean' &&
  Number.isInteger(value.status) &&
  (value.status as number) >= 100 &&
  (value.status as number) <= 599 &&
  typeof value.message === 'string' &&
  'data' in value &&
  'error' in value &&
  (value.success
    ? value.error === null
    : value.data === null && isObject(value.error) && typeof value.error.code === 'string')

export const createApiResponse = (status: number, payload: unknown): ApiResponse<unknown> => {
  if (isApiResponse(payload) && payload.status === status) return payload

  if (status >= 400) {
    const legacyError = isObject(payload) && isObject(payload.error) ? payload.error : undefined
    const message =
      (legacyError && typeof legacyError.message === 'string' && legacyError.message) ||
      (isObject(payload) && typeof payload.message === 'string' && payload.message) ||
      errorMessages[status] ||
      'The request could not be completed'
    const code =
      (legacyError && typeof legacyError.code === 'string' && legacyError.code) || `HTTP_${status}`
    const details = legacyError?.details

    return {
      success: false,
      status,
      message,
      data: null,
      error: details === undefined ? { code } : { code, details },
    }
  }

  const message =
    (isObject(payload) && typeof payload.message === 'string' && payload.message) ||
    successMessages[status] ||
    'Request completed successfully'

  return { success: true, status, message, data: payload ?? null, error: null }
}

export const installResponseEnvelope = (response: Response): void => {
  const sendJson = response.json.bind(response)
  response.json = ((payload: unknown) =>
    sendJson(createApiResponse(response.statusCode, payload))) as Response['json']
}
