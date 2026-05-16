import { Router } from 'express'
import { BudgetController } from './budgets.controller'

const router = Router()

router.get('/', BudgetController.list)
router.post('/', BudgetController.create)
router.put('/:id', BudgetController.update)
router.delete('/:id', BudgetController.delete)

export default router
