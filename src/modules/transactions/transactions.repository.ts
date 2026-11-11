import { prisma } from '../../core/db'
import { Prisma } from '@prisma/client'

export type TransactionType = 'income' | 'expense' | 'transfer'
export type TransferKind = 'internal' | 'external'

export type CreateTransactionDTO = {
  date: string
  amount: number
  description: string
  type: TransactionType
  transferKind?: TransferKind
  accountId?: string
  transferAccountId?: string
  categoryId?: string
  isSubscription?: boolean
}

export type TransactionFilters = {
  page?: number
  limit?: number
  type?: string
  flow?: string
  categoryId?: string
  categoryIds?: string
  uncategorized?: string
  accountId?: string
  accountIds?: string
  dateFrom?: string
  dateTo?: string
  search?: string
  isSubscription?: string
  subscriptionIds?: string
  sortBy?: string
  sortOrder?: string
}

function parseIdList(value?: string): string[] {
  if (!value) return []
  return value.split(',').map((id) => id.trim()).filter(Boolean)
}

export const TransactionRepository = {
  async findWithFilters(userId: string, filters: TransactionFilters) {
    const page = Math.max(1, filters.page ?? 1)
    const limit = Math.min(100, Math.max(1, filters.limit ?? 50))
    const skip = (page - 1) * limit
    const sortBy = filters.sortBy ?? 'date'
    const sortOrder = filters.sortOrder ?? 'desc'

    const where: Prisma.TransactionWhereInput = { userId }
    const conditions: Prisma.TransactionWhereInput[] = []

    if (filters.flow === 'expense') {
      conditions.push({
        OR: [
          { type: 'expense' },
          { type: 'transfer', transferKind: 'external', amount: { lt: 0 } },
        ],
      })
    } else if (filters.flow === 'income') {
      conditions.push({
        OR: [
          { type: 'income' },
          { type: 'transfer', transferKind: 'external', amount: { gt: 0 } },
        ],
      })
    } else if (filters.flow === 'savings') {
      conditions.push({
        type: 'transfer',
        OR: [
          { transferKind: 'internal' },
          { transferKind: null },
        ],
      })
    } else if (filters.type) {
      conditions.push({ type: filters.type as TransactionType })
    }

    const categoryIds = parseIdList(filters.categoryIds)
    const uncategorized = filters.uncategorized === 'true'
    if (categoryIds.length > 0 || uncategorized) {
      const categoryConditions: Prisma.TransactionWhereInput[] = []
      if (categoryIds.length > 0) categoryConditions.push({ categoryId: { in: categoryIds } })
      if (uncategorized) categoryConditions.push({ categoryId: null })
      conditions.push({ OR: categoryConditions })
    } else if (filters.categoryId) {
      conditions.push({ categoryId: filters.categoryId })
    }

    const accountIds = parseIdList(filters.accountIds)
    if (accountIds.length > 0) {
      conditions.push({ accountId: { in: accountIds } })
    } else if (filters.accountId) {
      conditions.push({ accountId: filters.accountId })
    }

    if (conditions.length > 0) {
      where.AND = conditions
    }
    if (filters.search) {
      where.description = {
        contains: filters.search,
        mode: 'insensitive',
      }
    }
    if (filters.subscriptionIds) {
      where.subscriptionId = { in: filters.subscriptionIds.split(',') }
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
        include: {
          account: true,
          transferAccount: true,
          category: true,
          subscription: { select: { name: true } },
        },
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
        transferAccount: true,
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
    transferKind?: TransferKind | null
    accountId?: string | null
    transferAccountId?: string | null
    categoryId?: string | null
    hash: string
    isSubscription?: boolean
  }) {
    return prisma.transaction.create({ data })
  },

  async createMany(transactions: Array<{
    userId: string
    date: Date
    amount: number
    description: string
    type: TransactionType
    transferKind?: TransferKind | null
    accountId?: string | null
    categoryId?: string | null
    hash: string
    source?: string
  }>) {
    return prisma.transaction.createMany({
      data: transactions,
      skipDuplicates: true,
    })
  },

  async findExistingHashes(userId: string, hashes: string[]) {
    if (hashes.length === 0) return [] as string[]

    const existing: string[] = []

    for (let index = 0; index < hashes.length; index += 500) {
      const chunk = hashes.slice(index, index + 500)
      const rows = await prisma.transaction.findMany({
        where: { userId, hash: { in: chunk } },
        select: { hash: true },
      })
      existing.push(...rows.map((row) => row.hash))
    }

    return existing
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

  async updateMany(
    userId: string,
    ids: string[],
    data: { categoryId?: string | null; accountId?: string | null }
  ) {
    return prisma.transaction.updateMany({
      where: {
        userId,
        id: { in: ids },
      },
      data,
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
    transferKind: TransferKind | null
    accountId: string | null
    transferAccountId: string | null
    categoryId: string | null
    hash: string
    isSubscription: boolean
  }>) {
    const tx = await prisma.transaction.updateMany({
      where: { id, userId },
      data,
    })
    if (tx.count === 0) return null
    return this.findById(userId, id)
  },
}
