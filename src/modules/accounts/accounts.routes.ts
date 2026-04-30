import { Router } from 'express'
import { AccountController } from './accounts.controller'

const router = Router()

router.get('/', AccountController.getAll)
router.get('/:id', AccountController.getById)
router.post('/', AccountController.create)
router.put('/:id', AccountController.update)
router.delete('/:id', AccountController.delete)

export default router
