import { Router } from 'express'
import { DashboardController } from './dashboard.controller'

const router = Router()

router.get('/', DashboardController.getDashboard)

export default router
