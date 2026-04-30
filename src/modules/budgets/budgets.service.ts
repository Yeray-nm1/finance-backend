import { BudgetRepository, CreateBudgetDTO } from './budgets.repository'
import { NotFoundError, ConflictError } from '../../core/errors'

export const BudgetService = {
  async getAll(userId: string) {
    return BudgetRepository.findAll(userId)
  },

  async getById(userId: string, id: string) {
    const budget = await BudgetRepository.findById(userId, id)
    if (!budget) {
      throw new NotFoundError('Budget')
    }
    return budget
  },

  async create(userId: string, dto: CreateBudgetDTO) {
    try {
      return await BudgetRepository.create(userId, dto)
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictError('Budget already exists for this category')
      }
      throw err
    }
  },

  async update(userId: string, id: string, dto: Partial<CreateBudgetDTO>) {
    await BudgetService.getById(userId, id)
    return BudgetRepository.update(userId, id, dto)
  },

  async delete(userId: string, id: string) {
    await BudgetService.getById(userId, id)
    return BudgetRepository.delete(userId, id)
  },
}
