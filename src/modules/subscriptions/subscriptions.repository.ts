import { prisma } from '../../core/db'

export type SubscriptionFrequency = 'weekly' | 'monthly' | 'yearly'
export type SubscriptionSource = 'manual' | 'detected'

export type CreateSubscriptionDTO = {
  name: string
  amount: number
  frequency: SubscriptionFrequency
  source?: SubscriptionSource
}

export const SubscriptionRepository = {
  async findAll(userId: string) {
    return prisma.subscription.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    })
  },

  async findById(userId: string, id: string) {
    return prisma.subscription.findFirst({ where: { id, userId } })
  },

  async create(userId: string, dto: CreateSubscriptionDTO) {
    return prisma.subscription.create({
      data: {
        userId,
        name: dto.name,
        amount: dto.amount,
        frequency: dto.frequency,
        confidence: dto.source === 'detected' ? 0.5 : 1.0,
        source: dto.source || 'manual',
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

  async saveDetected(userId: string, candidates: Array<{
    name: string
    amount: number
    frequency: SubscriptionFrequency
    confidence: number
  }>) {
    const subscriptions = candidates.map((c) => ({
      userId,
      name: c.name,
      amount: c.amount,
      frequency: c.frequency,
      confidence: c.confidence,
      source: 'detected' as const,
    }))

    return prisma.subscription.createMany({
      data: subscriptions,
      skipDuplicates: true,
    })
  },
}
