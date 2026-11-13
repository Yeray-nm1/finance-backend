import { Router } from 'express'
import { GoalController } from './goals.controller'

const router = Router()

router.get('/', GoalController.getAll)
router.post('/', GoalController.create)
router.get('/:id', GoalController.getById)
router.put('/:id', GoalController.update)
router.delete('/:id', GoalController.delete)
router.post('/:id/contributions', GoalController.contribute)
router.delete('/:id/contributions/:transactionId', GoalController.deleteContribution)

export default router
