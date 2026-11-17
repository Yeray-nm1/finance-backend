import { Router } from 'express'
import { NotificationController } from './notifications.controller'

const router = Router()

router.get('/', NotificationController.list)
router.get('/rules', NotificationController.getRules)
router.put('/rules', NotificationController.saveRules)
router.patch('/:id/read', NotificationController.markRead)
router.post('/read-all', NotificationController.markAllRead)

export default router
