import { Request, Response, NextFunction } from 'express'
import { config } from '../config/env'
import { UnauthorizedError } from '../core/errors'

/**
 * Protege los endpoints invocados por el `schedule` de GitHub Actions.
 * Se registra antes de `authMiddleware` porque el job no tiene sesión de usuario.
 * Si CRON_SECRET no está configurado, falla cerrado: nadie puede invocar el job.
 */
export function cronSecretMiddleware(req: Request, _res: Response, next: NextFunction) {
  const provided = req.headers['x-cron-secret']

  if (
    !config.cronSecret ||
    typeof provided !== 'string' ||
    provided !== config.cronSecret
  ) {
    throw new UnauthorizedError('Invalid or missing cron secret')
  }

  next()
}
