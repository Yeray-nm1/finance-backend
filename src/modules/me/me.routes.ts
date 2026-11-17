import { Router } from 'express'
import { MeController } from './me.controller'

const router = Router()

router.delete('/data', MeController.deleteData)
router.delete('/', MeController.deleteAccount)

export default router
