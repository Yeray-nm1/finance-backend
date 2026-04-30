import { TransactionRepository, CreateTransactionDTO } from './transactions.repository'
import { NotFoundError, BadRequestError } from '../../core/errors'
import { createTransactionHash } from '../../utils/hash'

export const TransactionService = {
  async getAll(userId: string) {
    return TransactionRepository.findAll(userId)
  },

  async getById(userId: string, id: string) {
    const tx = await TransactionRepository.findById(userId, id)
    if (!tx) {
      throw new NotFoundError('Transaction')
    }
    return tx
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
