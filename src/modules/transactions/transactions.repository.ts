import { prisma } from '../../core/db'
import { Prisma } from '@prisma/client'

export type TransactionType = 'income' | 'expense' | 'transfer'

export type CreateTransactionDTO = {
  date: string
  amount: number
  description: string
  type: TransactionType
  accountId?: string
  categoryId?: string
}

export type TransactionFilters = {
  page?: number
  limit?: number
  type?: string
  categoryId?: string
  accountId?: string
  dateFrom?: string
  dateTo?: string
  search?: string
  sortBy?: string
  sortOrder?: string
}

export const TransactionRepository = {
  async findWithFilters(userId: string, filters: TransactionFilters) {
    const page = Math.max(1, filters.page ?? 1)
    const limit = Math.min(100, Math.max(1, filters.limit ?? 50))
    const skip = (page - 1) * limit
    const sortBy = filters.sortBy ?? 'date'
    const sortOrder = filters.sortOrder ?? 'desc'

    const where: Prisma.TransactionWhereInput = { userId }

    if (filters.type) {
      where.type = filters.type as TransactionType
    }
    if (filters.categoryId) {
      where.categoryId = filters.categoryId
    }
    if (filters.accountId) {
      where.accountId = filters.accountId
    }
    if (filters.search) {
      where.description = {
        contains: filters.search,
        mode: 'insensitive',
      }
    }
    if (filters.dateFrom || filters.dateTo) {
      where.date = {}
      if (filters.dateFrom) {
        where.date.gte = new Date(filters.dateFrom)
      }
      if (filters.dateTo) {
        where.date.lte = new Date(filters.dateTo)
      }
    }

    const [data, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
        include: { account: true, category: true, subscription: { select: { name: true } } },
      }),
      prisma.transaction.count({ where }),
    ])

    return { data, total }
  },

  async findById(userId: string, id: string) {
    return prisma.transaction.findFirst({
      where: { id, userId },
      include: {
        account: true,
        category: true,
        subscription: { select: { name: true } },
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

  async delete(userId: string, id: string) {
    return prisma.transaction.deleteMany({
      where: { id, userId }
    })
  },

  async deleteMany(userId: string, ids: string[]) {
    return prisma.transaction.deleteMany({
      where: { 
        userId,
        id: { in: ids }
      }
    })
  },

  async deleteAllImported(userId: string) {
    return prisma.transaction.deleteMany({
      where: { userId, source: 'import' }
    })
  },

  async countAll(userId: string) {
    return prisma.transaction.count({ where: { userId } })
  },

  async findLatestExpenses(userId: string, limit: number) {
    return prisma.transaction.findMany({
      where: { userId, type: 'expense' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  },

  async update(userId: string, id: string, data: Partial<{
    date: Date
    amount: number
    description: string
    type: TransactionType
    accountId: string | null
    categoryId: string | null
    hash: string
  }>) {
    const tx = await prisma.transaction.updateMany({
      where: { id, userId },
      data,
    })
    if (tx.count === 0) return null
    return this.findById(userId, id)
  },
}
