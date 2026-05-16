import { BudgetRepository } from './budgets.repository'
import { NotFoundError, BadRequestError } from '../../core/errors'

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
}
