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

  async getMonthly(req: Request, res: Response) {
    const month = parseInt(req.query.month as string, 10)
    const year = parseInt(req.query.year as string, 10)

    if (!month || !year || isNaN(month) || isNaN(year)) {
      res.status(400).json({ error: 'month and year are required' })
      return
    }

    const budget = await BudgetService.getMonthly(req.userId, month, year)
    if (!budget) {
      res.status(404).json(null)
      return
    }
    res.json(budget)
  },

  async upsertMonthly(req: Request, res: Response) {
    const month = parseInt(req.query.month as string, 10)
    const year = parseInt(req.query.year as string, 10)

    if (!month || !year || isNaN(month) || isNaN(year)) {
      res.status(400).json({ error: 'month and year are required' })
      return
    }

    const { totalIncome, typeAllocations } = req.body
    const budget = await BudgetService.upsertMonthly(req.userId, month, year, totalIncome, typeAllocations)
    res.json(budget)
  },

  async calculateIncome(req: Request, res: Response) {
    const month = req.query.month ? parseInt(req.query.month as string, 10) : undefined
    const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined
    
    if ((month === undefined) !== (year === undefined)) {
      res.status(400).json({ error: 'Both month and year must be provided together' })
      return
    }
    
    const result = await BudgetService.calculateIncome(req.userId, month, year)
    res.json(result)
  },
}
