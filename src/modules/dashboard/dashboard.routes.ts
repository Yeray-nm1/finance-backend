import { Router } from 'express'
import { DashboardController } from './dashboard.controller'

const router = Router()

router.get('/', DashboardController.getDashboard)
router.get('/months', DashboardController.getMonths)

export default router
