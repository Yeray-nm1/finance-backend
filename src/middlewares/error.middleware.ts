import { Request, Response, NextFunction } from 'express'
import { AppError } from '../core/errors'
import { logger } from '../core/logger'

export function errorMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
    })
    return
  }

  logger.error('Unhandled error', { error: err })

  res.status(500).json({
    error: 'Internal server error',
  })
}
