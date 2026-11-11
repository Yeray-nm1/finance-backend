import { BudgetRepository } from './budgets.repository'
import { NotFoundError, BadRequestError } from '../../core/errors'
import { normalizeIncomeDescription } from '../../utils/normalize'
import { CategoryService } from '../categories/categories.service'

const BUDGET_TYPES = ['needs', 'leisure', 'savings', 'other']

interface TypeAllocationInput {
  type: string
  percentage: number
}

interface CategoryAllocationInput {
  categoryId: string
  amount: number
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function validateTypeAllocations(value: unknown): TypeAllocationInput[] {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new BadRequestError('typeAllocations must contain exactly 4 entries')
  }

  const allocations = value.map((item) => {
    const entry = item as TypeAllocationInput
    if (
      typeof entry?.type !== 'string' ||
      !BUDGET_TYPES.includes(entry.type) ||
      typeof entry?.percentage !== 'number' ||
      !Number.isFinite(entry.percentage) ||
      entry.percentage < 0 ||
      entry.percentage > 100
    ) {
      throw new BadRequestError('typeAllocations contains an invalid entry')
    }
    return { type: entry.type, percentage: entry.percentage }
  })

  const total = roundCurrency(allocations.reduce((sum, a) => sum + a.percentage, 0))
  if (Math.abs(total - 100) > 0.15) {
    throw new BadRequestError('Los porcentajes de los tipos deben sumar 100%')
  }

  return allocations
}

function validateCategoryAllocations(value: unknown): CategoryAllocationInput[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    throw new BadRequestError('categoryAllocations must be an array')
  }

  const seen = new Set<string>()
  return value.map((item) => {
    const entry = item as CategoryAllocationInput
    if (typeof entry?.categoryId !== 'string' || entry.categoryId.length === 0) {
      throw new BadRequestError('categoryAllocations contains an invalid category')
    }
    if (
      typeof entry?.amount !== 'number' ||
      !Number.isFinite(entry.amount) ||
      entry.amount < 0
    ) {
      throw new BadRequestError('categoryAllocations contains an invalid amount')
    }
    if (seen.has(entry.categoryId)) {
      throw new BadRequestError('categoryAllocations contains duplicated categories')
    }
    seen.add(entry.categoryId)
    return { categoryId: entry.categoryId, amount: roundCurrency(entry.amount) }
  })
}

export const BudgetService = {
  async list(userId: string, month?: number, year?: number) {
    const now = new Date()
    const m = month ?? now.getMonth() + 1
    const y = year ?? now.getFullYear()
    return BudgetRepository.findByPeriod(userId, m, y)
  },

  async create(userId: string, categoryId: string, percentage: number) {
    if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
      throw new BadRequestError('El porcentaje debe ser mayor que 0 y menor o igual que 100')
    }

    await CategoryService.getById(userId, categoryId)

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
    if (
      data.percentage !== undefined &&
      (!Number.isFinite(data.percentage) || data.percentage <= 0 || data.percentage > 100)
    ) {
      throw new BadRequestError('El porcentaje debe ser mayor que 0 y menor o igual que 100')
    }

    if (data.categoryId !== undefined) {
      await CategoryService.getById(userId, data.categoryId)
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

  async getAvailableMonths(userId: string) {
    return BudgetRepository.findMonthlyMonths(userId)
  },

  async upsertMonthly(
    userId: string, month: number, year: number,
    totalIncome: number, typeAllocations: unknown, categoryAllocations: unknown,
  ) {
    if (typeof totalIncome !== 'number' || totalIncome < 0) {
      throw new BadRequestError('totalIncome must be a non-negative number')
    }
    const allocations = validateTypeAllocations(typeAllocations)
    const categoryEntries = validateCategoryAllocations(categoryAllocations)

    const categories = await BudgetRepository.findCategories(userId)
    const typeByCategory = new Map(categories.map((c) => [c.id, c.type]))

    for (const entry of categoryEntries) {
      if (!typeByCategory.has(entry.categoryId)) {
        throw new BadRequestError('categoryAllocations contains an unknown category')
      }
    }

    for (const typeAllocation of allocations) {
      const typeCategories = categories.filter((c) => c.type === typeAllocation.type)
      if (typeCategories.length === 0) continue

      const expected = roundCurrency(totalIncome * (typeAllocation.percentage / 100))
      const typeIds = new Set(typeCategories.map((c) => c.id))
      const allocated = roundCurrency(
        categoryEntries
          .filter((entry) => typeIds.has(entry.categoryId))
          .reduce((sum, entry) => sum + entry.amount, 0)
      )

      if (Math.abs(allocated - expected) > 0.02) {
        throw new BadRequestError(
          `El reparto de ${typeAllocation.type} suma ${allocated} € y debe sumar ${expected} €`
        )
      }
    }

    return BudgetRepository.upsertMonthly(
      userId, month, year, totalIncome, allocations, categoryEntries
    )
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
