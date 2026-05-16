import { prisma } from '../../core/db'

export const BudgetRepository = {
  async findByPeriod(userId: string, month: number, year: number) {
    return prisma.budget.findMany({
      where: { userId, month, year },
      include: { category: true },
      orderBy: { category: { name: 'asc' } },
    })
  },

  async findById(userId: string, id: string) {
    return prisma.budget.findFirst({
      where: { id, userId },
      include: { category: true },
    })
  },

  async create(userId: string, categoryId: string, percentage: number, month: number, year: number) {
    return prisma.budget.create({
      data: { userId, categoryId, percentage, month, year },
      include: { category: true },
    })
  },

  async update(userId: string, id: string, data: { categoryId?: string; percentage?: number }) {
    const budget = await prisma.budget.findFirst({ where: { id, userId } })
    if (!budget) return null

    return prisma.budget.update({
      where: { id },
      data,
      include: { category: true },
    })
  },

  async delete(userId: string, id: string) {
    const budget = await prisma.budget.findFirst({ where: { id, userId } })
    if (!budget) return null

    return prisma.budget.delete({ where: { id } })
  },

  async exists(userId: string, categoryId: string, month: number, year: number) {
    const found = await prisma.budget.findUnique({
      where: { userId_categoryId_month_year: { userId, categoryId, month, year } },
    })
    return !!found
  },

  async calculateIncome(userId: string, month: number, year: number) {
    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 1)

    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        type: 'income',
        date: { gte: start, lt: end },
      },
    })

    return transactions.reduce((sum, tx) => sum + tx.amount, 0)
  },
}
