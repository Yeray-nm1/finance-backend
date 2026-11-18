import { Router } from 'express'
import { GoalContributionController } from './goal-contributions.controller'

const router = Router()

router.get('/pending', GoalContributionController.getPending)
router.post('/accept', GoalContributionController.accept)

export default router
