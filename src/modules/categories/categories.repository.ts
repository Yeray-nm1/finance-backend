import { prisma } from '../../core/db'
import { Prisma } from '@prisma/client'

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

  async findByName(userId: string, name: string, excludeId?: string) {
    return prisma.category.findFirst({
      where: {
        userId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    })
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
    return prisma.$transaction(async (tx) => {
      await tx.transaction.updateMany({
        where: { userId, categoryId: id },
        data: { categoryId: null },
      })

      await tx.budget.deleteMany({
        where: { userId, categoryId: id },
      })

      const monthlyBudgets = await tx.monthlyBudget.findMany({
        where: { userId },
        select: { id: true, categoryAllocations: true },
      })

      for (const monthly of monthlyBudgets) {
        const allocations = Array.isArray(monthly.categoryAllocations)
          ? (monthly.categoryAllocations as Array<Record<string, unknown>>)
          : []
        const filtered = allocations.filter((entry) => entry?.categoryId !== id)

        if (filtered.length === allocations.length) continue

        await tx.monthlyBudget.update({
          where: { id: monthly.id },
          data: { categoryAllocations: filtered as Prisma.InputJsonValue },
        })
      }

      return tx.category.delete({
        where: { id, userId },
      })
    })
  },
}
