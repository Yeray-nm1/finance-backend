import { prisma } from '../../core/db'

export type CreateBudgetDTO = {
  categoryId: string
  percentage: number
}

export const BudgetRepository = {
  async findAll(userId: string) {
    return prisma.budget.findMany({
      where: { userId },
      include: {
        category: true,
      },
      orderBy: { createdAt: 'desc' },
    })
  },

  async findById(userId: string, id: string) {
    return prisma.budget.findFirst({
      where: { id, userId },
      include: {
        category: true,
      },
    })
  },

  async create(userId: string, dto: CreateBudgetDTO) {
    return prisma.budget.create({
      data: {
        userId,
        categoryId: dto.categoryId,
        percentage: dto.percentage,
      },
      include: {
        category: true,
      },
    })
  },

  async update(userId: string, id: string, dto: Partial<CreateBudgetDTO>) {
    return prisma.budget.update({
      where: { id, userId },
      data: dto,
      include: {
        category: true,
      },
    })
  },

  async delete(userId: string, id: string) {
    return prisma.budget.delete({
      where: { id, userId },
    })
  },
}
