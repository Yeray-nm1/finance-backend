import { BudgetRepository } from './budgets.repository'
import { NotFoundError, BadRequestError } from '../../core/errors'
import { normalizeIncomeDescription } from '../../utils/normalize'

export const BudgetService = {
  async list(userId: string, month?: number, year?: number) {
    const now = new Date()
    const m = month ?? now.getMonth() + 1
    const y = year ?? now.getFullYear()
    return BudgetRepository.findByPeriod(userId, m, y)
  },

  async create(userId: string, categoryId: string, percentage: number) {
    if (!percentage || percentage <= 0 || percentage > 100) {
      throw new BadRequestError('El porcentaje debe ser mayor que 0 y menor o igual que 100')
    }

    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    const exists = await BudgetRepository.exists(userId, categoryId, month, year)
    if (exists) {
      throw new BadRequestError('Ya existe un presupuesto para esta categoría este mes')
    }

    return BudgetRepository.create(userId, categoryId, percentage, month, year)
  },

  async update(userId: string, id: string, data: { categoryId?: string; percentage?: number }) {
    if (data.percentage !== undefined && (data.percentage <= 0 || data.percentage > 100)) {
      throw new BadRequestError('El porcentaje debe ser mayor que 0 y menor o igual que 100')
    }

    const result = await BudgetRepository.update(userId, id, data)
    if (!result) {
      throw new NotFoundError('Presupuesto')
    }
    return result
  },

  async delete(userId: string, id: string) {
    const result = await BudgetRepository.delete(userId, id)
    if (!result) {
      throw new NotFoundError('Presupuesto')
    }
    return result
  },

  async getMonthly(userId: string, month: number, year: number) {
    return BudgetRepository.findMonthly(userId, month, year)
  },

  async upsertMonthly(
    userId: string, month: number, year: number,
    totalIncome: number, typeAllocations: unknown,
  ) {
    if (typeof totalIncome !== 'number' || totalIncome < 0) {
      throw new BadRequestError('totalIncome must be a non-negative number')
    }
    if (!Array.isArray(typeAllocations) || typeAllocations.length !== 4) {
      throw new BadRequestError('typeAllocations must contain exactly 4 entries')
    }
    return BudgetRepository.upsertMonthly(userId, month, year, totalIncome, typeAllocations)
  },

  async calculateIncome(userId: string, month?: number, year?: number) {
    const now = new Date()
    const actualMonth = month ?? (now.getMonth() === 0 ? 12 : now.getMonth())
    const actualYear = year ?? (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear())

    const transactions = await BudgetRepository.findIncomeByPeriod(userId, actualMonth, actualYear)
    
    if (transactions.length === 0) return []
    
    const groups = new Map<string, {
      label: string
      count: number
      totalAmount: number
      transactions: Array<{ id: string; date: string; amount: number; description: string }>
    }>()
    
    const descriptionCount = new Map<string, Map<string, number>>()
    
    for (const tx of transactions) {
      const key = normalizeIncomeDescription(tx.description)
      const dateStr = tx.date instanceof Date ? tx.date.toISOString() : new Date(tx.date).toISOString()
      
      if (!groups.has(key)) {
        groups.set(key, {
          label: tx.description,
          count: 0,
          totalAmount: 0,
          transactions: [],
        })
        descriptionCount.set(key, new Map())
      }
      
      const group = groups.get(key)!
      group.count += 1
      group.totalAmount = Math.round((group.totalAmount + tx.amount) * 100) / 100
      group.transactions.push({
        id: tx.id,
        date: dateStr,
        amount: tx.amount,
        description: tx.description,
      })
      
      const counts = descriptionCount.get(key)!
      counts.set(tx.description, (counts.get(tx.description) ?? 0) + 1)
    }
    
    // Set label to most frequent description
    for (const [key, group] of groups) {
      const counts = descriptionCount.get(key)!
      let maxCount = 0
      let mostFrequent = group.label
      for (const [desc, count] of counts) {
        if (count > maxCount) {
          maxCount = count
          mostFrequent = desc
        }
      }
      group.label = mostFrequent
    }
    
    return Array.from(groups.values())
      .sort((a, b) => b.totalAmount - a.totalAmount)
  },
}
