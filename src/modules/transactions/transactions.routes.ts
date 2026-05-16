import { Router } from 'express'
import { TransactionController } from './transactions.controller'

const router = Router()

router.get('/', TransactionController.getAll)
router.post('/import', TransactionController.importCsv)
router.get('/:id', TransactionController.getById)
router.post('/', TransactionController.create)
router.delete('/:id', TransactionController.delete)
router.post('/delete-many', TransactionController.deleteMany)
router.delete('/imported', TransactionController.deleteAllImported)

export default router
