import dotenv from 'dotenv'

dotenv.config({ quiet: true })

const requiredEnvironmentVariables = [
  'MONGODB_URI',
  'REDIS_URI',
  'SERVICE_NAME',
  'JWT_SECRET',
  'TOTP_ENCRYPTION_KEY',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'ADMIN_APP_BASE_URL',
  'AUTHOR_APP_BASE_URL',
  'STUDENT_APP_BASE_URL',
  'PAYSTACK_SECRET_KEY',
  'PAYSTACK_AUTHORIZATION_ENCRYPTION_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
] as const
const missingVariables = requiredEnvironmentVariables.filter(
  (variable) => !process.env[variable]?.trim(),
)

if (missingVariables.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVariables.join(', ')}`)
}

const positiveInteger = (name: string, fallback: number, maximum?: number): number => {
  const value = Number(process.env[name] ?? fallback)

  if (!Number.isInteger(value) || value <= 0 || (maximum !== undefined && value > maximum)) {
    throw new Error(
      `${name} must be a positive integer${maximum === undefined ? '' : ` no greater than ${maximum}`}`,
    )
  }

  return value
}

const NODE_ENV = process.env.NODE_ENV ?? 'development'
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info'
const validNodeEnvironments = ['development', 'test', 'production']
const validLogLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']

if (!validNodeEnvironments.includes(NODE_ENV)) {
  throw new Error(`NODE_ENV must be one of: ${validNodeEnvironments.join(', ')}`)
}

if (!validLogLevels.includes(LOG_LEVEL)) {
  throw new Error(`LOG_LEVEL must be one of: ${validLogLevels.join(', ')}`)
}

if ((process.env.JWT_SECRET?.length ?? 0) < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters')
}

const totpEncryptionKey = Buffer.from(process.env.TOTP_ENCRYPTION_KEY as string, 'base64')
if (totpEncryptionKey.length !== 32) {
  throw new Error('TOTP_ENCRYPTION_KEY must be a base64-encoded 32-byte key')
}

const paymentAuthorizationEncryptionKey = Buffer.from(
  process.env.PAYSTACK_AUTHORIZATION_ENCRYPTION_KEY as string,
  'base64',
)
if (paymentAuthorizationEncryptionKey.length !== 32) {
  throw new Error('PAYSTACK_AUTHORIZATION_ENCRYPTION_KEY must be a base64-encoded 32-byte key')
}

const absoluteUrl = (
  name: 'ADMIN_APP_BASE_URL' | 'AUTHOR_APP_BASE_URL' | 'STUDENT_APP_BASE_URL',
): string => {
  let value: URL
  try {
    value = new URL(process.env[name] as string)
  } catch {
    throw new Error(`${name} must be a valid absolute URL`)
  }
  if (NODE_ENV === 'production' && value.protocol !== 'https:')
    throw new Error(`${name} must use HTTPS in production`)
  return value.toString().replace(/\/$/, '')
}

const optionalAbsoluteUrl = (name: string): string | undefined => {
  const raw = process.env[name]?.trim()
  if (!raw) return undefined
  try {
    return new URL(raw).toString().replace(/\/$/, '')
  } catch {
    throw new Error(`${name} must be a valid absolute URL`)
  }
}

const paystackApiBaseUrl = (): string => {
  const raw = process.env.PAYSTACK_API_BASE_URL ?? 'https://api.paystack.co'
  let value: URL
  try {
    value = new URL(raw)
  } catch {
    throw new Error('PAYSTACK_API_BASE_URL must be a valid absolute URL')
  }
  if (NODE_ENV === 'production' && value.origin !== 'https://api.paystack.co')
    throw new Error('PAYSTACK_API_BASE_URL must use https://api.paystack.co in production')
  return value.toString().replace(/\/$/, '')
}

if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(process.env.PAYSTACK_SECRET_KEY as string))
  throw new Error('PAYSTACK_SECRET_KEY must be a valid Paystack secret key')

export const config = {
  NODE_ENV,
  LOG_LEVEL,
  PORT: positiveInteger('PORT', 3000, 65_535),
  MONGODB_URI: process.env.MONGODB_URI as string,
  REDIS_URI: process.env.REDIS_URI as string,
  ALLOWED_ORIGINS: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  SERVICE_NAME: process.env.SERVICE_NAME as string,
  JWT_SECRET: process.env.JWT_SECRET as string,
  TOTP_ENCRYPTION_KEY: process.env.TOTP_ENCRYPTION_KEY as string,
  RESEND_API_KEY: process.env.RESEND_API_KEY as string,
  EMAIL_FROM: process.env.EMAIL_FROM as string,
  ADMIN_APP_BASE_URL: absoluteUrl('ADMIN_APP_BASE_URL'),
  AUTHOR_APP_BASE_URL: absoluteUrl('AUTHOR_APP_BASE_URL'),
  STUDENT_APP_BASE_URL: absoluteUrl('STUDENT_APP_BASE_URL'),
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY as string,
  PAYSTACK_AUTHORIZATION_ENCRYPTION_KEY: process.env
    .PAYSTACK_AUTHORIZATION_ENCRYPTION_KEY as string,
  PAYSTACK_API_BASE_URL: paystackApiBaseUrl(),
  PAYSTACK_TIMEOUT_MS: positiveInteger('PAYSTACK_TIMEOUT_MS', 10_000, 30_000),
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID as string,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID as string,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY as string,
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME as string,
  R2_PUBLIC_BASE_URL: optionalAbsoluteUrl('R2_PUBLIC_BASE_URL'),
  AGORA_APP_ID: process.env.AGORA_APP_ID,
  AGORA_APP_CERTIFICATE: process.env.AGORA_APP_CERTIFICATE,
  AGORA_CUSTOMER_ID: process.env.AGORA_CUSTOMER_ID,
  AGORA_CUSTOMER_SECRET: process.env.AGORA_CUSTOMER_SECRET,
  NETLESS_APP_IDENTIFIER: process.env.NETLESS_APP_IDENTIFIER,
  NETLESS_SDK_TOKEN: process.env.NETLESS_SDK_TOKEN,
  CLOUDFLARE_STREAM_ACCOUNT_ID: process.env.CLOUDFLARE_STREAM_ACCOUNT_ID,
  CLOUDFLARE_STREAM_API_TOKEN: process.env.CLOUDFLARE_STREAM_API_TOKEN,
  CLOUDFLARE_STREAM_CUSTOMER_CODE: process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE,
  SHUTDOWN_TIMEOUT_MS: positiveInteger('SHUTDOWN_TIMEOUT_MS', 10_000),
  SUPER_ADMIN_FIRST_NAME: process.env.SUPER_ADMIN_FIRST_NAME,
  SUPER_ADMIN_LAST_NAME: process.env.SUPER_ADMIN_LAST_NAME,
  SUPER_ADMIN_EMAIL: process.env.SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD: process.env.SUPER_ADMIN_PASSWORD,
}

export type EnvironmentConfig = typeof config
