import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'

import { errorMiddleware } from './middlewares/error.middleware'
import { authMiddleware } from './middlewares/auth.middleware'

import authRoutes from './modules/auth/auth.routes'
import accountRoutes from './modules/accounts/accounts.routes'
import categoryRoutes from './modules/categories/categories.routes'
import transactionRoutes from './modules/transactions/transactions.routes'
import budgetRoutes from './modules/budgets/budgets.routes'
import subscriptionRoutes from './modules/subscriptions/subscriptions.routes'
import dashboardRoutes from './modules/dashboard/dashboard.routes'

const app = express()

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true
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
