import { TransactionRepository, CreateTransactionDTO, TransactionFilters } from './transactions.repository'
import { NotFoundError } from '../../core/errors'
import { createTransactionHash } from '../../utils/hash'
import { SubscriptionRepository } from '../subscriptions/subscriptions.repository'
import { normalizeDescription } from '../../utils/normalize'
import {
  formatCsvDate,
  normalizeCsvRow,
  parseCsvAmount,
  parseCsvDate,
  parseCsvType,
  pickCsvField,
  type CsvTransactionType,
} from '../../utils/csv'

export type UpdateTransactionDTO = {
  description?: string
  type?: 'income' | 'expense' | 'transfer'
  amount?: number
  date?: string
  accountId?: string | null
  categoryId?: string | null
  isSubscription?: boolean
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
      isSubscription: dto.isSubscription ?? false,
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
    if (dto.isSubscription !== undefined) data.isSubscription = dto.isSubscription

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
      type: CsvTransactionType
      accountId?: string | null
      categoryId?: string | null
      hash: string
      source: string
    }> = []

    const errors: Array<{ row: number; reason: string }> = []
    let invalid = 0

    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2
      const normalizedRow = normalizeCsvRow(row)

      const rawDate = pickCsvField(normalizedRow, 'date')
      const rawAmount = pickCsvField(normalizedRow, 'amount')
      const rawDescription = pickCsvField(normalizedRow, 'description')
      const rawType = pickCsvField(normalizedRow, 'type')

      if (!rawDate || !rawAmount || !rawDescription) {
        const missingFields: string[] = []
        if (!rawDate) missingFields.push('fecha')
        if (!rawAmount) missingFields.push('importe')
        if (!rawDescription) missingFields.push('concepto')

        invalid++
        errors.push({ row: rowNumber, reason: `Faltan campos: ${missingFields.join(', ')}` })
        continue
      }

      const date = parseCsvDate(rawDate)
      if (!date) {
        invalid++
        errors.push({ row: rowNumber, reason: `Fecha inválida: ${rawDate}` })
        continue
      }

      const parsedAmount = parseCsvAmount(rawAmount)
      if (parsedAmount === null || parsedAmount === 0) {
        invalid++
        errors.push({ row: rowNumber, reason: `Importe inválido: ${rawAmount}` })
        continue
      }

      const explicitType = parseCsvType(rawType)
      const type: CsvTransactionType = explicitType ?? (parsedAmount >= 0 ? 'income' : 'expense')
      const amount =
        type === 'income'
          ? Math.abs(parsedAmount)
          : type === 'expense'
            ? -Math.abs(parsedAmount)
            : parsedAmount

      const description = rawDescription.trim()
      const hash = createTransactionHash(formatCsvDate(date), amount, description)

      transactions.push({
        userId,
        date,
        amount,
        description,
        type,
        hash,
        source: 'import',
      })
    }

    const result = transactions.length > 0
      ? await TransactionRepository.createMany(transactions)
      : { count: 0 }

    const imported = result.count

    if (imported > 0) {
      const expenseTransactions = await TransactionRepository.findLatestExpenses(userId, imported)

      for (const tx of expenseTransactions) {
        const normalizedDesc = normalizeDescription(tx.description)
        const matchingSubs = await SubscriptionRepository.findSubscriptionsByMatchDescription(userId, normalizedDesc)

        if (matchingSubs.length === 1) {
          const sub = matchingSubs[0]
          await SubscriptionRepository.linkTransaction(userId, tx.id, sub.id)

          const tolerance = sub.amountTolerance ?? 10.0
          const amount = Math.abs(tx.amount)
          const diff = Math.abs(amount - sub.amount)
          const maxDiff = sub.amount * (tolerance / 100)

          if (diff > maxDiff) {
            await SubscriptionRepository.createPriceChange(userId, {
              subscriptionId: sub.id,
              transactionId: tx.id,
              previousAmount: sub.amount,
              newAmount: amount,
            })
          }
        } else if (matchingSubs.length > 1) {
          await SubscriptionRepository.createConflict(userId, {
            transactionId: tx.id,
            subscriptionIds: matchingSubs.map((s) => s.id),
          })
        }
      }
    }

    return {
      imported,
      total: rows.length,
      valid: transactions.length,
      duplicates: transactions.length - imported,
      invalid,
      errors: errors.slice(0, 10),
    }
  },
}
