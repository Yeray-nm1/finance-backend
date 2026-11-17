import { Router } from 'express'
import { cronSecretMiddleware } from '../../middlewares/cron-secret.middleware'
import { NotificationController } from './notifications.controller'

const router = Router()

router.post('/process', cronSecretMiddleware, NotificationController.process)

export default router
