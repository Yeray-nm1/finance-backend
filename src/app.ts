import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'

import { errorMiddleware } from './middlewares/error.middleware'
import { authMiddleware } from './middlewares/auth.middleware'
import { config } from './config/env'

import authRoutes from './modules/auth/auth.routes'
import accountRoutes from './modules/accounts/accounts.routes'
import categoryRoutes from './modules/categories/categories.routes'
import transactionRoutes from './modules/transactions/transactions.routes'
import budgetRoutes from './modules/budgets/budgets.routes'
import subscriptionRoutes from './modules/subscriptions/subscriptions.routes'
import dashboardRoutes from './modules/dashboard/dashboard.routes'
import goalRoutes from './modules/goals/goals.routes'
import notificationRoutes from './modules/notifications/notifications.routes'
import meRoutes from './modules/me/me.routes'

const app = express()

// Detrás del proxy de producción, req.ip debe ser el del cliente real.
// Sin esto, todos los usuarios comparten la IP del proxy y el rate limit
// (10 intentos fallidos / 15 min) bloquearía a todo el mundo a la vez.
if (config.nodeEnv === 'production') {
  app.set('trust proxy', 1)
}

app.use(helmet())

// Healthcheck para la plataforma (Render). Fuera del rate limit global.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intenta de nuevo en un minuto.' },
  // Los E2E hacen muchas peticiones seguidas desde una sola IP y no deben
  // chocar con el límite global.
  skip: () => config.nodeEnv === 'test',
})

app.use(globalLimiter)
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())
app.use(morgan('dev'))

app.use('/api/v1/auth', authRoutes)

app.use(authMiddleware)

app.use('/api/v1/accounts', accountRoutes)
app.use('/api/v1/categories', categoryRoutes)
app.use('/api/v1/transactions', transactionRoutes)
app.use('/api/v1/budgets', budgetRoutes)
app.use('/api/v1/subscriptions', subscriptionRoutes)
app.use('/api/v1/dashboard', dashboardRoutes)
app.use('/api/v1/goals', goalRoutes)
app.use('/api/v1/notifications', notificationRoutes)
app.use('/api/v1/me', meRoutes)

app.use(errorMiddleware)

export default app
