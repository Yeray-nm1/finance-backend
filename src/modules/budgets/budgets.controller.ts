import { Request, Response } from 'express'
import { BudgetService } from './budgets.service'
import { requireFields, requireField } from '../../middlewares/validate.middleware'
import { BadRequestError } from '../../core/errors'

export const BudgetController = {
  async getAll(req: Request, res: Response) {
    const budgets = await BudgetService.getAll(req.userId)
    res.json(budgets)
  },

  async getById(req: Request, res: Response) {
    const budget = await BudgetService.getById(req.userId, req.params.id as string)
    res.json(budget)
  },

  async create(req: Request, res: Response) {
    requireFields(req.body, 'categoryId')

    const percentage = requireField<number>(req.body, 'percentage')
    if (percentage < 0 || percentage > 100) {
      throw new BadRequestError('percentage must be between 0 and 100')
    }

    const { categoryId } = req.body
    const budget = await BudgetService.create(req.userId, { categoryId, percentage })
    res.status(201).json(budget)
  },

  async update(req: Request, res: Response) {
    const { categoryId, percentage } = req.body
    const budget = await BudgetService.update(req.userId, req.params.id as string, { categoryId, percentage })
    res.json(budget)
  },

  async delete(req: Request, res: Response) {
    await BudgetService.delete(req.userId, req.params.id as string)
    res.status(204).send()
  },
}
