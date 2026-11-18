import { createHash, randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { config } from '../../config/env'
import { BadRequestError } from '../../core/errors'

export const RESET_TOKEN_SCOPE = 'password_reset'
export const RESET_TOKEN_TTL = '30m'
const INVALID_TOKEN_MESSAGE = 'Enlace de restablecimiento no válido o caducado'

export interface ResetTokenPayload {
  sub: string
  scope: typeof RESET_TOKEN_SCOPE
  pwd: string
}

/** Huella del hash guardado: invalidate los enlaces si la contraseña cambia antes de usarlos. */
export function passwordFingerprint(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16)
}

export function signResetToken(userId: string, passwordHash: string): string {
  return jwt.sign(
    {
      sub: userId,
      scope: RESET_TOKEN_SCOPE,
      pwd: passwordFingerprint(passwordHash),
      jti: randomUUID(),
    },
    config.jwtSecret,
    { algorithm: 'HS256', expiresIn: RESET_TOKEN_TTL },
  )
}

export function resetTokenIdempotencyKey(token: string): string {
  return `finance:password_reset:${createHash('sha256').update(token).digest('hex')}`
}

export function decodeResetToken(token: string): ResetTokenPayload {
  let decoded: jwt.JwtPayload | string
  try {
    decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] })
  } catch {
    throw new BadRequestError(INVALID_TOKEN_MESSAGE)
  }

  if (
    typeof decoded === 'string' ||
    decoded.scope !== RESET_TOKEN_SCOPE ||
    typeof decoded.sub !== 'string' ||
    typeof decoded.pwd !== 'string'
  ) {
    throw new BadRequestError(INVALID_TOKEN_MESSAGE)
  }

  return { sub: decoded.sub, scope: RESET_TOKEN_SCOPE, pwd: decoded.pwd }
}
