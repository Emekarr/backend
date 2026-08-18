import type { SchemaDefinition } from 'mongoose'
import { generateID } from '../../../identifiers/generators'

export const baseSchema: SchemaDefinition = {
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: generateID,
  },
}

export const baseSchemaOptions = {
  timestamps: true,
  versionKey: false,
  toJSON: {
    transform: (_document: unknown, returnedObject: Record<string, unknown>) => {
      delete returnedObject._id
      delete returnedObject.__v
      delete returnedObject.password
      return returnedObject
    },
  },
  toObject: {
    transform: (_document: unknown, returnedObject: Record<string, unknown>) => {
      delete returnedObject._id
      delete returnedObject.__v
      return returnedObject
    },
  },
} as const
