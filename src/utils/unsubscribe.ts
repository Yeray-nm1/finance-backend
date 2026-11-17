import jwt from 'jsonwebtoken'
import { config } from '../config/env'

interface UnsubscribePayload {
  sub: string
  scope: 'unsubscribe'
}

/**
 * Token sin `iat` ni `exp` para que la URL sea determinista: el micro calcula el
 * hash del payload para detectar reenvíos con la misma clave de idempotencia,
 * y un token con timestamp distinto en cada ejecución produciría un falso 409.
 */
export function createUnsubscribeToken(userId: string): string {
  return jwt.sign({ sub: userId, scope: 'unsubscribe' }, config.jwtSecret, {
    noTimestamp: true,
  })
}

export function verifyUnsubscribeToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as Partial<UnsubscribePayload>
    return payload.scope === 'unsubscribe' && typeof payload.sub === 'string'
      ? payload.sub
      : null
  } catch {
    return null
  }
}

/**
 * Enlace absoluto bajo el dominio del frontend: Next.js reescribe `/api/v1/*`
 * hacia el backend, así que el correo no expone la URL interna de Render.
 */
export function createUnsubscribeUrl(userId: string): string {
  const base = config.frontendUrl.replace(/\/$/, '')
  return `${base}/api/v1/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(userId))}`
}
