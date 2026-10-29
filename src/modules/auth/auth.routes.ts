import { Router, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { AuthController } from './auth.controller'
import { authMiddleware } from '../../middlewares/auth.middleware'

const router = Router()

function rateLimitHandler(_req: Request, res: Response) {
  const reset = Number(res.getHeader('RateLimit-Reset'))
  const minutes = Number.isFinite(reset) ? Math.max(1, Math.ceil(reset / 60)) : 15
  res.status(429).json({
    error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`,
  })
}

// Solo cuentan los intentos fallidos (4xx): un login correcto no consume cuota.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})

// El registro exitoso tampoco debe gastar el límite; solo los fallidos (emails duplicados, etc.).
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})

router.post('/register', registerLimiter, AuthController.register)
router.post('/login', loginLimiter, AuthController.login)
router.get('/me', authMiddleware, AuthController.me)
router.post('/logout', AuthController.logout)

export default router
