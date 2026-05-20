import { TransactionRepository, CreateTransactionDTO, TransactionFilters } from './transactions.repository'
import { NotFoundError, BadRequestError } from '../../core/errors'
import { createTransactionHash } from '../../utils/hash'

export type UpdateTransactionDTO = {
  description?: string
  type?: 'income' | 'expense' | 'transfer'
  amount?: number
  date?: string
  accountId?: string | null
  categoryId?: string | null
}

export const TransactionService = {
  async getAll(userId: string, filters?: TransactionFilters) {
    return TransactionRepository.findWithFilters(userId, filters ?? {})
  },

  async getById(userId: string, id: string) {
    const tx = await TransactionRepository.findById(userId, id)
    if (!tx) {
      throw new NotFoundError('Transaction')
    }
    return tx
  },

  async delete(userId: string, id: string) {
    const tx = await TransactionRepository.findById(userId, id)
    if (!tx) {
      throw new NotFoundError('Transaction')
    }
    return TransactionRepository.delete(userId, id)
  },

  async deleteMany(userId: string, ids: string[]) {
    return TransactionRepository.deleteMany(userId, ids)
  },

  async deleteAllImported(userId: string) {
    return TransactionRepository.deleteAllImported(userId)
  },

  async create(userId: string, dto: CreateTransactionDTO) {
    const hash = createTransactionHash(dto.date, dto.amount, dto.description)

    return TransactionRepository.create({
      userId,
      date: new Date(dto.date),
      amount: dto.amount,
      description: dto.description,
      type: dto.type,
      accountId: dto.accountId || null,
      categoryId: dto.categoryId || null,
      hash,
    })
  },

  async update(userId: string, id: string, dto: UpdateTransactionDTO) {
    const existing = await TransactionRepository.findById(userId, id)
    if (!existing) {
      throw new NotFoundError('Transaction')
    }

    const data: Record<string, unknown> = {}

    if (dto.description !== undefined) data.description = dto.description
    if (dto.type !== undefined) data.type = dto.type
    if (dto.amount !== undefined) data.amount = dto.amount
    if (dto.date !== undefined) data.date = new Date(dto.date)
    if (dto.accountId !== undefined) data.accountId = dto.accountId
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId

    const dateChanged = dto.date !== undefined
    const amountChanged = dto.amount !== undefined
    const descChanged = dto.description !== undefined
    if (dateChanged || amountChanged || descChanged) {
      const newDate = dto.date ?? existing.date.toISOString()
      const newAmount = dto.amount ?? existing.amount
      const newDesc = dto.description ?? existing.description
      data.hash = createTransactionHash(newDate, newAmount, newDesc)
    }

    const updated = await TransactionRepository.update(userId, id, data as Parameters<typeof TransactionRepository.update>[2])
    return updated
  },

  async importMany(userId: string, rows: Array<Record<string, string>>) {
    const transactions: Array<{
      userId: string
      date: Date
      amount: number
      description: string
      type: 'income' | 'expense' | 'transfer'
      accountId?: string | null
      categoryId?: string | null
      hash: string
    }> = []

    for (const row of rows) {
      const date = row.date || row.Date || row.fecha || row.FECHA
      const amount = row.amount || row.Amount || row.importe || row.IMPORTE
      const description = row.description || row.Description || row.descripcion || row.DESCRIPCION || row.concepto || row.CONCEPTO
      const type = (row.type || row.Type || row.tipo || row.TIPO || 'expense').toLowerCase()

      if (!date || !amount || !description) {
        continue
      }

      const parsedAmount = parseFloat(String(amount).replace(/[^\d.,-]/g, '').replace(',', '.'))

      if (isNaN(parsedAmount) || parsedAmount === 0) {
        continue
      }

      const normalizedType: 'income' | 'expense' | 'transfer' =
        ['income', 'expense', 'transfer'].includes(type)
          ? (type as 'income' | 'expense' | 'transfer')
          : parsedAmount >= 0
            ? 'income'
            : 'expense'

      const dateStr = new Date(date).toISOString()
      const hash = createTransactionHash(dateStr, parsedAmount, description)

      transactions.push({
        userId,
        date: new Date(date),
        amount: parsedAmount,
        description: String(description),
        type: normalizedType,
        hash,
      })
    }

    if (transactions.length === 0) {
      throw new BadRequestError('No valid transactions found in CSV')
    }

    const result = await TransactionRepository.createMany(transactions)

    return {
      imported: result.count,
      total: transactions.length,
    }
  },
}
