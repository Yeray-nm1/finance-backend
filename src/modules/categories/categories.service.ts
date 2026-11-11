import { CategoryRepository, CreateCategoryDTO, CategoryType } from './categories.repository'
import { BadRequestError, ConflictError, NotFoundError } from '../../core/errors'

const CATEGORY_TYPES: CategoryType[] = ['needs', 'leisure', 'savings', 'other']

function normalizeName(name: string): string {
  const trimmed = name.trim()

  if (!trimmed) {
    throw new BadRequestError('El nombre de la categoría es obligatorio')
  }

  return trimmed
}

function normalizeType(type: string): CategoryType {
  if (!CATEGORY_TYPES.includes(type as CategoryType)) {
    throw new BadRequestError('El tipo de categoría debe ser needs, leisure, savings u other')
  }

  return type as CategoryType
}

type QueryOpts = {
  search?: string
  page?: number
  limit?: number
}

export const CategoryService = {
  async getAll(userId: string, opts: QueryOpts = {}) {
    return CategoryRepository.findAll(userId, opts)
  },

  async getById(userId: string, id: string) {
    const category = await CategoryRepository.findById(userId, id)
    if (!category) {
      throw new NotFoundError('Category')
    }
    return category
  },

  async create(userId: string, dto: CreateCategoryDTO) {
    const name = normalizeName(dto.name)
    const type = normalizeType(dto.type)

    const existing = await CategoryRepository.findByName(userId, name)
    if (existing) {
      throw new ConflictError('Ya existe una categoría con ese nombre')
    }

    return CategoryRepository.create(userId, { name, type })
  },

  async update(userId: string, id: string, dto: Partial<CreateCategoryDTO>) {
    await CategoryService.getById(userId, id)

    const data: Partial<CreateCategoryDTO> = {}

    if (dto.name !== undefined) {
      data.name = normalizeName(dto.name)
      const existing = await CategoryRepository.findByName(userId, data.name, id)
      if (existing) {
        throw new ConflictError('Ya existe una categoría con ese nombre')
      }
    }

    if (dto.type !== undefined) {
      data.type = normalizeType(dto.type)
    }

    return CategoryRepository.update(userId, id, data)
  },

  async delete(userId: string, id: string) {
    await CategoryService.getById(userId, id)
    return CategoryRepository.delete(userId, id)
  },
}
