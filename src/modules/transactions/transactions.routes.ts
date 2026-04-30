import { Router } from 'express'
import { TransactionController } from './transactions.controller'

const router = Router()

router.get('/', TransactionController.getAll)
router.post('/import', TransactionController.importCsv)
router.get('/:id', TransactionController.getById)
router.post('/', TransactionController.create)

export default router
