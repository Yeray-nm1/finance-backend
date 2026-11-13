import { Request, Response } from 'express'
import { GoalService } from './goals.service'
import { requireFields } from '../../middlewares/validate.middleware'

export const GoalController = {
  async getAll(req: Request, res: Response) {
    const includeArchived = req.query.includeArchived === 'true'
    const goals = await GoalService.getAll(req.userId, includeArchived)
    res.json(goals)
  },

  async getById(req: Request, res: Response) {
    const goal = await GoalService.getById(req.userId, req.params.id as string)
    res.json(goal)
  },

  async create(req: Request, res: Response) {
    requireFields(req.body, 'name', 'targetAmount')

    const { name, targetAmount, targetDate, accountId } = req.body

    const goal = await GoalService.create(req.userId, {
      name,
      targetAmount,
      targetDate,
      accountId,
    })

    res.status(201).json(goal)
  },

  async update(req: Request, res: Response) {
    const { name, targetAmount, targetDate, accountId, isArchived } = req.body

    const goal = await GoalService.update(req.userId, req.params.id as string, {
      name,
      targetAmount,
      targetDate,
      accountId,
      isArchived,
    })

    res.json(goal)
  },

  async delete(req: Request, res: Response) {
    await GoalService.delete(req.userId, req.params.id as string)
    res.status(204).send()
  },

  async contribute(req: Request, res: Response) {
    requireFields(req.body, 'amount', 'date', 'accountId')

    const { amount, date, accountId } = req.body

    const contribution = await GoalService.contribute(
      req.userId,
      req.params.id as string,
      { amount, date, accountId }
    )

    res.status(201).json(contribution)
  },

  async deleteContribution(req: Request, res: Response) {
    await GoalService.deleteContribution(
      req.userId,
      req.params.id as string,
      req.params.transactionId as string
    )

    res.status(204).send()
  },
}
