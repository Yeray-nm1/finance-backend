import { Request, Response } from 'express'
import { SubscriptionService } from './subscriptions.service'
import { requireFields, requireEnum } from '../../middlewares/validate.middleware'

export const SubscriptionController = {
  async getAll(req: Request, res: Response) {
    const subscriptions = await SubscriptionService.getAll(req.userId)
    res.json(subscriptions)
  },

  async getById(req: Request, res: Response) {
    const subscription = await SubscriptionService.getById(req.userId, req.params.id as string)
    res.json(subscription)
  },

  async create(req: Request, res: Response) {
    requireFields(req.body, 'name', 'amount', 'frequency')
    const { name, amount, frequency } = req.body

    const subscription = await SubscriptionService.create(req.userId, {
      name,
      amount,
      frequency: requireEnum(frequency, ['weekly', 'monthly', 'yearly'], 'frequency'),
    })
    res.status(201).json(subscription)
  },

  async update(req: Request, res: Response) {
    const { name, amount, frequency } = req.body
    const subscription = await SubscriptionService.update(req.userId, req.params.id as string, { name, amount, frequency })
    res.json(subscription)
  },

  async delete(req: Request, res: Response) {
    await SubscriptionService.delete(req.userId, req.params.id as string)
    res.status(204).send()
  },

  async detect(req: Request, res: Response) {
    const candidates = await SubscriptionService.detectCandidates(req.userId)
    res.json({ candidates })
  },

  async autoDetectAndSave(req: Request, res: Response) {
    const result = await SubscriptionService.autoDetectAndSave(req.userId)
    res.json(result)
  },
}
