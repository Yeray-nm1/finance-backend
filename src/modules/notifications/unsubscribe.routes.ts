import { Router } from 'express'
import { NotificationController } from './notifications.controller'

const router = Router()

router.get('/', NotificationController.unsubscribe)

export default router
