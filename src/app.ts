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

const app = express()

app.use(helmet())

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intenta de nuevo en un minuto.' },
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

app.use(errorMiddleware)

export default app
