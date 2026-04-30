import { CategoryRepository, CreateCategoryDTO } from './categories.repository'
import { NotFoundError } from '../../core/errors'

export const CategoryService = {
  async getAll(userId: string) {
    return CategoryRepository.findAll(userId)
  },

  async getById(userId: string, id: string) {
    const category = await CategoryRepository.findById(userId, id)
    if (!category) {
      throw new NotFoundError('Category')
    }
    return category
  },

  async create(userId: string, dto: CreateCategoryDTO) {
    return CategoryRepository.create(userId, dto)
  },

  async update(userId: string, id: string, dto: Partial<CreateCategoryDTO>) {
    await CategoryService.getById(userId, id)
    return CategoryRepository.update(userId, id, dto)
  },

  async delete(userId: string, id: string) {
    await CategoryService.getById(userId, id)
    return CategoryRepository.delete(userId, id)
  },
}
