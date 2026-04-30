import { Request, Response } from 'express'
import { AccountService } from './accounts.service'
import { requireFields } from '../../middlewares/validate.middleware'

export const AccountController = {
  async getAll(req: Request, res: Response) {
    const accounts = await AccountService.getAll(req.userId)
    res.json(accounts)
  },

  async getById(req: Request, res: Response) {
    const account = await AccountService.getById(req.userId, req.params.id as string)
    res.json(account)
  },

  async create(req: Request, res: Response) {
    requireFields(req.body, 'name', 'type')
    const { name, type } = req.body

    const account = await AccountService.create(req.userId, { name, type })
    res.status(201).json(account)
  },

  async update(req: Request, res: Response) {
    const { name, type } = req.body
    const account = await AccountService.update(req.userId, req.params.id as string, { name, type })
    res.json(account)
  },

  async delete(req: Request, res: Response) {
    await AccountService.delete(req.userId, req.params.id as string)
    res.status(204).send()
  },
}
