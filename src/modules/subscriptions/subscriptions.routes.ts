import { Router } from 'express'
import { SubscriptionController } from './subscriptions.controller'

const router = Router()

router.get('/', SubscriptionController.getAll)
router.post('/', SubscriptionController.create)
router.get('/detect', SubscriptionController.detect)
router.post('/detect/save', SubscriptionController.saveDetected)
router.get('/conflicts', SubscriptionController.getConflicts)
router.post('/conflicts/:id/resolve', SubscriptionController.resolveConflict)
router.get('/:id', SubscriptionController.getById)
router.put('/:id', SubscriptionController.update)
router.delete('/:id', SubscriptionController.delete)
router.post('/:id/confirm-match', SubscriptionController.confirmMatch)
router.post('/:id/unlink-transactions', SubscriptionController.unlinkTransactions)
router.post('/:id/dismiss-price-changes', SubscriptionController.dismissPriceChanges)

export default router
