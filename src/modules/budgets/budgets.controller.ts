import { Request, Response } from 'express'
import { BudgetService } from './budgets.service'
import { requireFields } from '../../middlewares/validate.middleware'

export const BudgetController = {
  async list(req: Request, res: Response) {
    const month = req.query.month ? parseInt(req.query.month as string, 10) : undefined
    const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined
    const budgets = await BudgetService.list(req.userId, month, year)
    res.json(budgets)
  },

  async create(req: Request, res: Response) {
    requireFields(req.body, 'categoryId', 'percentage')
    const { categoryId, percentage } = req.body
    const budget = await BudgetService.create(req.userId, categoryId, parseFloat(percentage))
    res.status(201).json(budget)
  },

  async update(req: Request, res: Response) {
    const { categoryId, percentage } = req.body
    const data: { categoryId?: string; percentage?: number } = {}
    if (categoryId !== undefined) data.categoryId = categoryId
    if (percentage !== undefined) data.percentage = parseFloat(percentage)

    const budget = await BudgetService.update(req.userId, req.params.id as string, data)
    res.json(budget)
  },

  async delete(req: Request, res: Response) {
    await BudgetService.delete(req.userId, req.params.id as string)
    res.status(204).send()
  },
}
