import { Request } from 'express'
import { BadRequestError } from '../core/errors'

export function requireFields(body: Record<string, unknown>, ...fields: string[]) {
  const missing: string[] = []

  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      missing.push(field)
    }
  }

  if (missing.length > 0) {
    throw new BadRequestError(`Missing required fields: ${missing.join(', ')}`)
  }
}

export function requireField<T = unknown>(body: Record<string, unknown>, field: string): T {
  if (body[field] === undefined || body[field] === null || body[field] === '') {
    throw new BadRequestError(`Missing required field: ${field}`)
  }
  return body[field] as T
}

export function requireEnum<T extends string>(value: string, valid: readonly T[], fieldName: string): T {
  if (!valid.includes(value as T)) {
    throw new BadRequestError(`Invalid ${fieldName}. Must be one of: ${valid.join(', ')}`)
  }
  return value as T
}
