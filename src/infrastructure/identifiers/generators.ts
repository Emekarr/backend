import { randomInt } from 'node:crypto'
import { ulid } from 'ulid'

export const generateID = (): string => ulid()
export const generateOTP = (): string => randomInt(0, 1_000_000).toString().padStart(6, '0')
