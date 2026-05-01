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
  let token: string | undefined

  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1]
  }

  if (!token && req.cookies) {
    token = req.cookies.finance_token
  }

  if (!token) {
    throw new UnauthorizedError('Missing or invalid authorization token')
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string }
    req.userId = decoded.userId
    next()
  } catch {
    throw new UnauthorizedError('Invalid or expired token')
  }
}
