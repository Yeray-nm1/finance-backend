import { Router } from 'express'
import { TransactionController } from './transactions.controller'

const router = Router()

router.get('/', TransactionController.getAll)
router.post('/import', TransactionController.importCsv)
router.post('/', TransactionController.create)
router.delete('/batch', TransactionController.deleteMany)
router.delete('/imported', TransactionController.deleteAllImported)
router.get('/:id', TransactionController.getById)
router.patch('/:id', TransactionController.update)
router.delete('/:id', TransactionController.delete)

export default router
