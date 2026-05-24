import { prisma } from '../../core/db'

export type CreateSubscriptionDTO = {
  name: string
  amount: number
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'yearly'
  matchDescriptions?: string[]
}

export const SubscriptionRepository = {
  async findAll(userId: string) {
    const subs = await prisma.subscription.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    })

    const enriched = await Promise.all(
      subs.map(async (sub) => {
        const lastTransaction = await prisma.transaction.findFirst({
          where: { userId, subscriptionId: sub.id },
          orderBy: { date: 'desc' },
          select: { id: true, amount: true, date: true, description: true },
        })

        const priceChanges = await prisma.priceChange.findMany({
          where: { userId, subscriptionId: sub.id, seen: false },
          orderBy: { createdAt: 'desc' },
        })

        return {
          ...sub,
          lastTransaction: lastTransaction ?? undefined,
          priceChanges: priceChanges.length > 0 ? priceChanges : undefined,
        }
      })
    )

    return enriched
  },

  async findById(userId: string, id: string) {
    const sub = await prisma.subscription.findFirst({ where: { id, userId } })
    if (!sub) return null

    const lastTransaction = await prisma.transaction.findFirst({
      where: { userId, subscriptionId: sub.id },
      orderBy: { date: 'desc' },
      select: { id: true, amount: true, date: true, description: true },
    })

    const priceChanges = await prisma.priceChange.findMany({
      where: { userId, subscriptionId: sub.id, seen: false },
      orderBy: { createdAt: 'desc' },
    })

    return {
      ...sub,
      lastTransaction: lastTransaction ?? undefined,
      priceChanges: priceChanges.length > 0 ? priceChanges : undefined,
    }
  },

  async create(userId: string, dto: CreateSubscriptionDTO) {
    return prisma.subscription.create({
      data: {
        userId,
        name: dto.name,
        amount: dto.amount,
        frequency: dto.frequency,
      },
    })
  },

  async update(userId: string, id: string, dto: Partial<CreateSubscriptionDTO>) {
    return prisma.subscription.update({
      where: { id, userId },
      data: dto,
    })
  },

  async delete(userId: string, id: string) {
    return prisma.subscription.delete({
      where: { id, userId },
    })
  },

  async unlinkTransactions(userId: string, subscriptionId: string) {
    return prisma.transaction.updateMany({
      where: { userId, subscriptionId },
      data: { subscriptionId: null },
    })
  },

  async linkTransaction(userId: string, transactionId: string, subscriptionId: string) {
    return prisma.transaction.update({
      where: { id: transactionId, userId },
      data: { subscriptionId },
    })
  },

  async findTransactionById(userId: string, transactionId: string) {
    return prisma.transaction.findFirst({
      where: { id: transactionId, userId },
    })
  },

  async findTransactionSubscriptionId(userId: string, transactionId: string) {
    const tx = await prisma.transaction.findUnique({
      where: { id: transactionId },
      select: { subscriptionId: true },
    })
    return tx?.subscriptionId ?? null
  },

  async markPriceChangesAsSeen(userId: string, subscriptionId: string) {
    return prisma.priceChange.updateMany({
      where: { userId, subscriptionId, seen: false },
      data: { seen: true },
    })
  },

  async createPriceChange(userId: string, data: {
    subscriptionId: string
    transactionId: string
    previousAmount: number
    newAmount: number
  }) {
    return prisma.priceChange.create({ data: { ...data, userId } })
  },

  async addMatchDescription(userId: string, id: string, description: string) {
    const sub = await prisma.subscription.findFirst({ where: { id, userId } })
    if (!sub) return null

    const current = sub.matchDescriptions as string[]
    if (current.includes(description)) return sub

    return prisma.subscription.update({
      where: { id, userId },
      data: { matchDescriptions: [...current, description] },
    })
  },

  async findSubscriptionsByMatchDescription(userId: string, normalizedDesc: string) {
    const subs = await prisma.subscription.findMany({
      where: { userId },
    })
    return subs.filter((s) => {
      const descriptions = s.matchDescriptions as string[]
      if (descriptions.includes(normalizedDesc)) return true
      const normalizedName = s.name.toUpperCase().trim()
      return normalizedName === normalizedDesc
    })
  },

  async findAllConflicts(userId: string) {
    return prisma.subscriptionConflict.findMany({
      where: { userId, resolved: false },
      orderBy: { createdAt: 'desc' },
    })
  },

  async findConflictById(userId: string, id: string) {
    return prisma.subscriptionConflict.findFirst({
      where: { id, userId },
    })
  },

  async createConflict(userId: string, data: {
    transactionId: string
    subscriptionIds: string[]
  }) {
    return prisma.subscriptionConflict.create({
      data: { ...data, userId },
    })
  },

  async resolveConflict(userId: string, id: string, subscriptionId: string) {
    const conflict = await prisma.subscriptionConflict.findFirst({ where: { id, userId } })
    if (!conflict) return null
    if (conflict.resolved) return null

    await prisma.transaction.update({
      where: { id: conflict.transactionId, userId },
      data: { subscriptionId },
    })

    return prisma.subscriptionConflict.update({
      where: { id },
      data: { resolved: true },
    })
  },
}
