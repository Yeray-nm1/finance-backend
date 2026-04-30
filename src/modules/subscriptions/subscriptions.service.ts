import { SubscriptionRepository, CreateSubscriptionDTO } from './subscriptions.repository'
import { TransactionRepository } from '../transactions/transactions.repository'
import { NotFoundError } from '../../core/errors'
import { normalizeDescription } from '../../utils/normalize'

type TransactionGroup = {
  name: string
  transactions: Array<{ date: Date; amount: number }>
  avgAmount: number
  count: number
  avgDaysBetween: number
}

function detectFrequency(avgDays: number): 'weekly' | 'monthly' | 'yearly' | null {
  if (avgDays >= 4 && avgDays <= 10) return 'weekly'
  if (avgDays >= 25 && avgDays <= 35) return 'monthly'
  if (avgDays >= 350 && avgDays <= 380) return 'yearly'
  return null
}

function calculateAvgDaysBetween(dates: Date[]): number {
  if (dates.length < 2) return 0

  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime())
  let totalDays = 0

  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i].getTime() - sorted[i - 1].getTime()
    totalDays += diff / (1000 * 60 * 60 * 24)
  }

  return totalDays / (sorted.length - 1)
}

export const SubscriptionService = {
  async getAll(userId: string) {
    return SubscriptionRepository.findAll(userId)
  },

  async getById(userId: string, id: string) {
    const sub = await SubscriptionRepository.findById(userId, id)
    if (!sub) {
      throw new NotFoundError('Subscription')
    }
    return sub
  },

  async create(userId: string, dto: CreateSubscriptionDTO) {
    return SubscriptionRepository.create(userId, {
      ...dto,
      source: 'manual',
    })
  },

  async update(userId: string, id: string, dto: Partial<CreateSubscriptionDTO>) {
    await SubscriptionService.getById(userId, id)
    return SubscriptionRepository.update(userId, id, dto)
  },

  async delete(userId: string, id: string) {
    await SubscriptionService.getById(userId, id)
    return SubscriptionRepository.delete(userId, id)
  },

  async detectCandidates(userId: string) {
    const groups = await TransactionRepository.findGroupedByDescription(userId)
    const candidates: Array<{
      name: string
      amount: number
      frequency: 'weekly' | 'monthly' | 'yearly'
      confidence: number
    }> = []

    for (const [name, transactions] of Object.entries(groups)) {
      if (transactions.length < 2) continue

      const amounts = transactions.map((t: { date: Date; amount: number }) => Math.abs(t.amount))
      const avgAmount = amounts.reduce((sum: number, a: number) => sum + a, 0) / amounts.length
      const amountVariance = amounts.reduce((sum: number, a: number) => sum + Math.pow(a - avgAmount, 2), 0) / amounts.length
      const amountConsistency = 1 - Math.min(amountVariance / (avgAmount * avgAmount), 1)

      const dates = transactions.map((t: { date: Date; amount: number }) => new Date(t.date))
      const avgDays = calculateAvgDaysBetween(dates)
      const frequency = detectFrequency(avgDays)

      if (!frequency) continue

      const confidence = (amountConsistency * 0.6) + (Math.min(transactions.length / 5, 1) * 0.4)

      if (confidence < 0.5) continue

      candidates.push({
        name,
        amount: Math.round(avgAmount * 100) / 100,
        frequency,
        confidence: Math.round(confidence * 100) / 100,
      })
    }

    return candidates
  },

  async autoDetectAndSave(userId: string) {
    const candidates = await SubscriptionService.detectCandidates(userId)

    if (candidates.length === 0) {
      return { detected: 0 }
    }

    const result = await SubscriptionRepository.saveDetected(userId, candidates)

    return { detected: result.count }
  },
}
