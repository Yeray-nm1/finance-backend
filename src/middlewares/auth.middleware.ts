import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config/env'
import { UnauthorizedError } from '../core/errors'

declare global {
  namespace Express {
    interface Request {
      userId: string
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization

  if (!header || !header.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid authorization header')
  }

  const token = header.split(' ')[1]

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string }
    req.userId = decoded.userId
    next()
  } catch {
    throw new UnauthorizedError('Invalid or expired token')
  }
}
