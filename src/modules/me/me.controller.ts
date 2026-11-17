import { Request, Response } from 'express'
import { MeService } from './me.service'
import { requireField } from '../../middlewares/validate.middleware'

export const MeController = {
  async deleteData(req: Request, res: Response) {
    await MeService.deleteAllData(req.userId)
    res.status(204).send()
  },

  async deleteAccount(req: Request, res: Response) {
    const password = requireField<string>(req.body, 'password')
    await MeService.deleteAccount(req.userId, password)
    res.clearCookie('finance_token')
    res.status(204).send()
  },
}
