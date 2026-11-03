import { TransactionRepository, CreateTransactionDTO, TransactionFilters } from './transactions.repository'
import { NotFoundError } from '../../core/errors'
import { createTransactionHash } from '../../utils/hash'
import { SubscriptionRepository } from '../subscriptions/subscriptions.repository'
import { normalizeDescription } from '../../utils/normalize'
import {
  detectCsvAmountFormat,
  detectCsvDateFormat,
  formatCsvDate,
  normalizeCsvRow,
  parseCsvAmount,
  parseCsvDate,
  parseCsvType,
  pickMappedCsvField,
  resolveCsvMapping,
  type CsvMapping,
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

interface CsvEntry {
  rowNumber: number
  date: Date | null
  amount: number | null
  description: string
  type: CsvTransactionType
  hash: string
  error: string | null
}

const PREVIEW_ROW_LIMIT = 200

function buildCsvEntries(
  rows: Array<Record<string, string>>,
  mapping: CsvMapping
): CsvEntry[] {
  return rows.map((row, index) => {
    const rowNumber = index + 2
    const normalizedRow = normalizeCsvRow(row)

    const rawDate = pickMappedCsvField(normalizedRow, mapping, 'date')
    const rawAmount = pickMappedCsvField(normalizedRow, mapping, 'amount')
    const rawDescription = pickMappedCsvField(normalizedRow, mapping, 'description')
    const rawType = pickMappedCsvField(normalizedRow, mapping, 'type')

    const missingBase = (
      date: Date | null,
      amount: number | null,
      description: string,
      error: string | null
    ): CsvEntry => ({
      rowNumber,
      date,
      amount,
      description,
      type: parseCsvType(rawType) ?? 'expense',
      hash: '',
      error,
    })

    if (!rawDate || !rawAmount || !rawDescription) {
      const missingFields: string[] = []
      if (!rawDate) missingFields.push('fecha')
      if (!rawAmount) missingFields.push('importe')
      if (!rawDescription) missingFields.push('concepto')

      return missingBase(
        null,
        null,
        rawDescription ?? '',
        `Faltan campos: ${missingFields.join(', ')}`
      )
    }

    const date = parseCsvDate(rawDate)
    if (!date) {
      return missingBase(null, null, rawDescription, `Fecha inválida: ${rawDate}`)
    }

    const parsedAmount = parseCsvAmount(rawAmount)
    if (parsedAmount === null || parsedAmount === 0) {
      return missingBase(date, null, rawDescription, `Importe inválido: ${rawAmount}`)
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

    return {
      rowNumber,
      date,
      amount,
      description,
      type,
      hash: createTransactionHash(formatCsvDate(date), amount, description),
      error: null,
    }
  })
}

function firstMappedValue(
  rows: Array<Record<string, string>>,
  mapping: CsvMapping,
  field: 'date' | 'amount'
): string | null {
  for (const row of rows) {
    const value = pickMappedCsvField(normalizeCsvRow(row), mapping, field)
    if (value) return value
  }

  return null
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

  async previewImport(
    userId: string,
    rows: Array<Record<string, string>>,
    mappingInput?: unknown
  ) {
    const mapping = resolveCsvMapping(rows, mappingInput)
    const entries = buildCsvEntries(rows, mapping)
    const hashes = entries
      .filter((entry) => entry.error === null)
      .map((entry) => entry.hash)
    const existingHashes = new Set(
      await TransactionRepository.findExistingHashes(userId, hashes)
    )

    const seen = new Set<string>()
    const previewRows: Array<{
      row: number
      date: string | null
      amount: number | null
      description: string
      type: CsvTransactionType
      status: 'ok' | 'error' | 'duplicate'
      reason?: string
    }> = []

    let valid = 0
    let invalid = 0
    let duplicates = 0

    for (const entry of entries) {
      let status: 'ok' | 'error' | 'duplicate' = 'ok'
      let reason: string | undefined

      if (entry.error) {
        invalid++
        status = 'error'
        reason = entry.error
      } else if (existingHashes.has(entry.hash)) {
        duplicates++
        status = 'duplicate'
        reason = 'Ya existe en la base de datos (no se importará)'
      } else if (seen.has(entry.hash)) {
        duplicates++
        status = 'duplicate'
        reason = 'Repetida en el archivo (no se importará)'
      } else {
        seen.add(entry.hash)
        valid++
      }

      if (previewRows.length < PREVIEW_ROW_LIMIT) {
        previewRows.push({
          row: entry.rowNumber,
          date: entry.date ? formatCsvDate(entry.date) : null,
          amount: entry.amount,
          description: entry.description,
          type: entry.type,
          status,
          ...(reason ? { reason } : {}),
        })
      }
    }

    const rawDate = firstMappedValue(rows, mapping, 'date')
    const rawAmount = firstMappedValue(rows, mapping, 'amount')

    return {
      total: rows.length,
      valid,
      invalid,
      duplicates,
      rows: previewRows,
      truncated: rows.length > PREVIEW_ROW_LIMIT,
      errors: entries
        .filter((entry) => entry.error !== null)
        .slice(0, 10)
        .map((entry) => ({ row: entry.rowNumber, reason: entry.error as string })),
      mapping,
      detected: {
        date: rawDate && parseCsvDate(rawDate) ? detectCsvDateFormat(rawDate) : null,
        amount: rawAmount && parseCsvAmount(rawAmount) !== null
          ? detectCsvAmountFormat(rawAmount)
          : null,
      },
    }
  },

  async importMany(
    userId: string,
    rows: Array<Record<string, string>>,
    mappingInput?: unknown
  ) {
    const mapping = resolveCsvMapping(rows, mappingInput)
    const entries = buildCsvEntries(rows, mapping)

    const errors = entries
      .filter((entry) => entry.error !== null)
      .map((entry) => ({ row: entry.rowNumber, reason: entry.error as string }))

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

    const seen = new Set<string>()
    let duplicatesInFile = 0

    for (const entry of entries) {
      if (entry.error || !entry.date || entry.amount === null) continue

      if (seen.has(entry.hash)) {
        duplicatesInFile++
        continue
      }

      seen.add(entry.hash)

      transactions.push({
        userId,
        date: entry.date,
        amount: entry.amount,
        description: entry.description,
        type: entry.type,
        hash: entry.hash,
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
      duplicates: duplicatesInFile + (transactions.length - imported),
      invalid: errors.length,
      errors: errors.slice(0, 10),
    }
  },
}
