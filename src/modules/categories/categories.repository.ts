import { prisma } from '../../core/db'

export type CategoryType = 'needs' | 'leisure' | 'savings' | 'other'

export type CreateCategoryDTO = {
  name: string
  type: CategoryType
}

type QueryOpts = {
  search?: string
  page?: number
  limit?: number
}

export const CategoryRepository = {
  async findAll(userId: string, opts: QueryOpts = {}) {
    const where: Record<string, unknown> = { userId }

    if (opts.search) {
      where.name = { contains: opts.search, mode: 'insensitive' }
    }

    if (opts.page && opts.limit) {
      const skip = (opts.page - 1) * opts.limit
      const [items, total] = await Promise.all([
        prisma.category.findMany({
          where,
          orderBy: { name: 'asc' },
          skip,
          take: opts.limit,
        }),
        prisma.category.count({ where }),
      ])
      return { items, total, page: opts.page, limit: opts.limit }
    }

    return prisma.category.findMany({
      where,
      orderBy: { name: 'asc' },
    })
  },

  async findById(userId: string, id: string) {
    return prisma.category.findFirst({ where: { id, userId } })
  },

  async create(userId: string, dto: CreateCategoryDTO) {
    return prisma.category.create({
      data: {
        userId,
        name: dto.name,
        type: dto.type,
      },
    })
  },

  async update(userId: string, id: string, dto: Partial<CreateCategoryDTO>) {
    return prisma.category.update({
      where: { id, userId },
      data: dto,
    })
  },

  async delete(userId: string, id: string) {
    return prisma.category.delete({
      where: { id, userId },
    })
  },
}
