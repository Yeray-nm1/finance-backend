import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { AuthController } from './auth.controller'
import { authMiddleware } from '../../middlewares/auth.middleware'

const router = Router()

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' },
})

router.post('/register', authLimiter, AuthController.register)
router.post('/login', authLimiter, AuthController.login)
router.get('/me', authMiddleware, AuthController.me)
router.post('/logout', AuthController.logout)

export default router
