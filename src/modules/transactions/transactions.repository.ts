import { prisma } from '../../core/db'

export type TransactionType = 'income' | 'expense' | 'transfer'

export type CreateTransactionDTO = {
  date: string
  amount: number
  description: string
  type: TransactionType
  accountId?: string
  categoryId?: string
}

export const TransactionRepository = {
  async findAll(userId: string) {
    return prisma.transaction.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      include: {
        account: true,
        category: true,
      },
    })
  },

  async findById(userId: string, id: string) {
    return prisma.transaction.findFirst({
      where: { id, userId },
      include: {
        account: true,
        category: true,
      },
    })
  },

  async findByMonth(userId: string, year: number, month: number) {
    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 1)

    return prisma.transaction.findMany({
      where: {
        userId,
        date: {
          gte: start,
          lt: end,
        },
      },
      include: {
        category: true,
      },
      orderBy: { date: 'desc' },
    })
  },

  async create(data: {
    userId: string
    date: Date
    amount: number
    description: string
    type: TransactionType
    accountId?: string | null
    categoryId?: string | null
    hash: string
  }) {
    return prisma.transaction.create({ data })
  },

  async createMany(transactions: Array<{
    userId: string
    date: Date
    amount: number
    description: string
    type: TransactionType
    accountId?: string | null
    categoryId?: string | null
    hash: string
  }>) {
    return prisma.transaction.createMany({
      data: transactions,
      skipDuplicates: true,
    })
  },

  async findByDescriptionPattern(userId: string, pattern: string) {
    return prisma.transaction.findMany({
      where: {
        userId,
        description: {
          contains: pattern,
          mode: 'insensitive',
        },
      },
      orderBy: { date: 'desc' },
    })
  },

  async findGroupedByDescription(userId: string) {
    const transactions = await prisma.transaction.findMany({
      where: { userId, type: 'expense' },
      orderBy: { date: 'desc' },
    })

    const groups: Record<string, typeof transactions> = {}

    for (const tx of transactions) {
      const normalized = tx.description.toUpperCase().trim()
      if (!groups[normalized]) {
        groups[normalized] = []
      }
      groups[normalized].push(tx)
    }

    return groups
  },
}
