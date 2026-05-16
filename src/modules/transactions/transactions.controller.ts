import { Request, Response } from 'express'
import { TransactionService } from './transactions.service'
import { requireFields, requireField, requireEnum } from '../../middlewares/validate.middleware'
import { BadRequestError } from '../../core/errors'

export const TransactionController = {
  async getAll(req: Request, res: Response) {
    const transactions = await TransactionService.getAll(req.userId)
    res.json(transactions)
  },

  async getById(req: Request, res: Response) {
    const transaction = await TransactionService.getById(req.userId, req.params.id as string)
    res.json(transaction)
  },

  async create(req: Request, res: Response) {
    requireFields(req.body, 'date', 'amount', 'description', 'type')
    const { date, amount, description, type, accountId, categoryId } = req.body

    const transaction = await TransactionService.create(req.userId, {
      date,
      amount: parseFloat(requireField<string>(req.body, 'amount')),
      description,
      type: requireEnum(type, ['income', 'expense', 'transfer'], 'type'),
      accountId,
      categoryId,
    })

    res.status(201).json(transaction)
  },

  async importCsv(req: Request, res: Response) {
    const rows = requireField<Array<Record<string, string>>>(req.body, 'rows')

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestError('rows must be a non-empty array')
    }

    const result = await TransactionService.importMany(req.userId, rows)
    res.status(201).json(result)
  },

  async delete(req: Request, res: Response) {
    await TransactionService.delete(req.userId, req.params.id as string)
    res.status(204).send()
  },

  async deleteMany(req: Request, res: Response) {
    const ids = req.query.ids as string | undefined
    if (!ids) {
      throw new BadRequestError('ids query parameter is required (comma-separated)')
    }
    const idArray = ids.split(',').map(s => s.trim()).filter(Boolean)
    if (idArray.length === 0) {
      throw new BadRequestError('ids must be a non-empty comma-separated list')
    }
    const result = await TransactionService.deleteMany(req.userId, idArray)
    res.json({ deleted: result.count })
  },

  async deleteAllImported(req: Request, res: Response) {
    const result = await TransactionService.deleteAllImported(req.userId)
    res.json({ deleted: result.count })
  },
}
