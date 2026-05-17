import { Router } from 'express'
import { BudgetController } from './budgets.controller'

const router = Router()

router.get('/', BudgetController.list)
router.get('/calculate-income', BudgetController.calculateIncome)
router.get('/monthly', BudgetController.getMonthly)
router.put('/monthly', BudgetController.upsertMonthly)
router.post('/', BudgetController.create)
router.put('/:id', BudgetController.update)
router.delete('/:id', BudgetController.delete)

export default router
