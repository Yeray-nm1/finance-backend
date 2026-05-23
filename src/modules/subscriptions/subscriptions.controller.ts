import { Request, Response } from 'express'
import { SubscriptionService } from './subscriptions.service'
import { requireFields, requireEnum } from '../../middlewares/validate.middleware'
import { VALID_FREQUENCIES } from '../../utils/constants'

export const SubscriptionController = {
  async getAll(req: Request, res: Response) {
    const subscriptions = await SubscriptionService.getAll(req.userId)
    res.json(subscriptions)
  },

  async getById(req: Request, res: Response) {
    const subscription = await SubscriptionService.getById(req.userId, req.params.id as string as string)
    res.json(subscription)
  },

  async create(req: Request, res: Response) {
    requireFields(req.body, 'name', 'amount', 'frequency')
    const { name, amount, frequency, transactionId } = req.body

    const subscription = await SubscriptionService.create(req.userId, {
      name,
      amount,
      frequency: requireEnum(frequency, VALID_FREQUENCIES, 'frequency'),
      transactionId,
    })
    res.status(201).json(subscription)
  },

  async update(req: Request, res: Response) {
    const { name, amount, frequency, matchDescriptions } = req.body
    const data: Record<string, unknown> = {}
    if (name !== undefined) data.name = name
    if (amount !== undefined) data.amount = amount
    if (frequency !== undefined) {
      data.frequency = requireEnum(frequency, VALID_FREQUENCIES, 'frequency')
    }
    if (matchDescriptions !== undefined) {
      data.matchDescriptions = Array.isArray(matchDescriptions) ? matchDescriptions : []
    }
    const subscription = await SubscriptionService.update(req.userId, req.params.id as string, data)
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

  async saveDetected(req: Request, res: Response) {
    requireFields(req.body, 'candidates')
    const { candidates } = req.body
    const result = await SubscriptionService.saveDetected(req.userId, candidates)
    res.json(result)
  },

  async confirmMatch(req: Request, res: Response) {
    requireFields(req.body, 'description')
    const { description, transactionId } = req.body
    const subscription = await SubscriptionService.confirmMatch(
      req.userId,
      req.params.id as string,
      description,
      transactionId,
    )
    res.json(subscription)
  },

  async unlinkTransactions(req: Request, res: Response) {
    await SubscriptionService.unlinkTransactions(req.userId, req.params.id as string)
    res.status(200).json({ unlinked: true })
  },

  async dismissPriceChanges(req: Request, res: Response) {
    await SubscriptionService.dismissPriceChanges(req.userId, req.params.id as string)
    res.status(200).json({ dismissed: true })
  },

  async getConflicts(req: Request, res: Response) {
    const conflicts = await SubscriptionService.getConflicts(req.userId)
    res.json(conflicts)
  },

  async resolveConflict(req: Request, res: Response) {
    requireFields(req.body, 'subscriptionId')
    const { subscriptionId } = req.body
    await SubscriptionService.resolveConflict(req.userId, req.params.id as string, subscriptionId)
    res.status(200).json({ resolved: true })
  },
}
