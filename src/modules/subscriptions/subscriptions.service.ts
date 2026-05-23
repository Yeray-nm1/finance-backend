import { SubscriptionRepository, CreateSubscriptionDTO } from './subscriptions.repository'
import { TransactionRepository } from '../transactions/transactions.repository'
import { NotFoundError, BadRequestError } from '../../core/errors'
import { normalizeDescription } from '../../utils/normalize'
import { isSimilarName } from '../../utils/compare'
import { VALID_FREQUENCIES } from '../../utils/constants'

function detectFrequency(avgDays: number): (typeof VALID_FREQUENCIES)[number] | null {
  if (avgDays >= 4 && avgDays <= 10) return 'weekly'
  if (avgDays >= 11 && avgDays <= 17) return 'biweekly'
  if (avgDays >= 25 && avgDays <= 35) return 'monthly'
  if (avgDays >= 55 && avgDays <= 75) return 'bimonthly'
  if (avgDays >= 80 && avgDays <= 100) return 'quarterly'
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

function checkDuplicates(userId: string, name: string, excludeId?: string) {
  return SubscriptionRepository.findAll(userId).then((existing) => {
    for (const sub of existing) {
      if (excludeId && sub.id === excludeId) continue
      if (isSimilarName(name, sub.name)) {
        throw new BadRequestError(`Ya existe una suscripcion similar: "${sub.name}"`)
      }
    }
  })
}

export const SubscriptionService = {
  async getAll(userId: string) {
    return SubscriptionRepository.findAll(userId)
  },

  async getById(userId: string, id: string) {
    const sub = await SubscriptionRepository.findById(userId, id)
    if (!sub) throw new NotFoundError('Subscription')
    return sub
  },

  async create(userId: string, dto: CreateSubscriptionDTO & { transactionId?: string }) {
    await checkDuplicates(userId, dto.name)

    const sub = await SubscriptionRepository.create(userId, {
      name: dto.name,
      amount: dto.amount,
      frequency: dto.frequency,
    })

    if (dto.transactionId) {
      const tx = await SubscriptionRepository.findTransactionById(userId, dto.transactionId)
      if (!tx) throw new BadRequestError('Transaction not found')

      const existingSubId = await SubscriptionRepository.findTransactionSubscriptionId(userId, dto.transactionId)
      if (existingSubId) throw new BadRequestError('Transaction already linked to another subscription')

      await SubscriptionRepository.linkTransaction(userId, dto.transactionId, sub.id)
      const normalizedDesc = normalizeDescription(tx.description)
      await SubscriptionRepository.addMatchDescription(userId, sub.id, normalizedDesc)

      const matchingTxs = await TransactionRepository.findByDescriptionPattern(userId, normalizedDesc)
      for (const matchTx of matchingTxs) {
        if (matchTx.id === dto.transactionId) continue
        if (matchTx.subscriptionId) continue

        await SubscriptionRepository.linkTransaction(userId, matchTx.id, sub.id)
      }
    }

    return SubscriptionRepository.findById(userId, sub.id)
  },

  unlinkTransactions(userId: string, id: string) {
    return SubscriptionService.getById(userId, id).then(() =>
      SubscriptionRepository.unlinkTransactions(userId, id)
    )
  },

  dismissPriceChanges(userId: string, id: string) {
    return SubscriptionService.getById(userId, id).then(() =>
      SubscriptionRepository.markPriceChangesAsSeen(userId, id)
    )
  },

  async update(userId: string, id: string, dto: Partial<CreateSubscriptionDTO>) {
    await SubscriptionService.getById(userId, id)

    if (dto.name !== undefined) {
      await checkDuplicates(userId, dto.name, id)
    }

    const updated = await SubscriptionRepository.update(userId, id, dto)

    if (dto.amount !== undefined) {
      await SubscriptionRepository.markPriceChangesAsSeen(userId, id)
    }

    return updated
  },

  async delete(userId: string, id: string) {
    await SubscriptionService.getById(userId, id)
    await SubscriptionRepository.unlinkTransactions(userId, id)
    return SubscriptionRepository.delete(userId, id)
  },

  async detectCandidates(userId: string) {
    const groups = await TransactionRepository.findGroupedByDescription(userId)
    const existingSubs = await SubscriptionRepository.findAll(userId)

    function findMatchingExisting(candidateName: string) {
      for (const sub of existingSubs) {
        for (const desc of (sub.matchDescriptions as string[]) || []) {
          if (candidateName === desc) return sub
        }
        if (isSimilarName(candidateName, sub.name)) return sub
      }
      return null
    }

    const candidates = []

    for (const [name, transactions] of Object.entries(groups)) {
      if (transactions.length < 2) continue

      const amounts = transactions.map((t) => Math.abs(t.amount))
      const latestAmount = Math.abs(transactions[0].amount)
      const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length
      const divisor = avgAmount * avgAmount
      const amountConsistency = divisor === 0 ? 1 : 1 - Math.min(
        amounts.reduce((sum, a) => sum + Math.pow(a - avgAmount, 2), 0) / divisor, 1
      )

      const avgDays = calculateAvgDaysBetween(transactions.map((t) => t.date))
      const frequency = detectFrequency(avgDays)

      if (!frequency) continue

      const confidence = (amountConsistency * 0.6) + (Math.min(transactions.length / 5, 1) * 0.4)
      const existing = findMatchingExisting(name)
      const existingAmount = existing?.amount

      candidates.push({
        name,
        amount: Math.round(latestAmount * 100) / 100,
        existingAmount: existingAmount ? Math.round(existingAmount * 100) / 100 : undefined,
        frequency,
        confidence: Math.round(confidence * 100) / 100,
        transactions: transactions.map((t) => ({
          id: t.id,
          date: t.date.toISOString(),
          description: t.description,
          amount: Math.abs(t.amount),
        })),
        exists: existing !== null,
      })
    }

    return candidates
  },

  async saveDetected(userId: string, candidates: Array<{
    name: string
    amount: number
    frequency: string
  }>) {
    let created = 0
    for (const c of candidates) {
      const normalized = normalizeDescription(c.name)
      const allExisting = await SubscriptionRepository.findAll(userId)
      const existingSub = allExisting.find((s) => isSimilarName(c.name, s.name))

      if (existingSub) {
        if (existingSub.name !== c.name) {
          await SubscriptionRepository.update(userId, existingSub.id, { name: c.name })
        }

        const diff = Math.abs(c.amount - existingSub.amount)
        const matchingTxs = await TransactionRepository.findByDescriptionPattern(userId, normalized)
        const latestTx = matchingTxs.length > 0 ? matchingTxs[0] : null

        if (diff > 0 && latestTx) {
          await SubscriptionRepository.createPriceChange(userId, {
            subscriptionId: existingSub.id,
            transactionId: latestTx.id,
            previousAmount: existingSub.amount,
            newAmount: Math.abs(latestTx.amount),
          })
        }

        await SubscriptionRepository.addMatchDescription(userId, existingSub.id, normalized)
      } else {
        const sub = await SubscriptionRepository.create(userId, {
          name: c.name,
          amount: c.amount,
          frequency: c.frequency as (typeof VALID_FREQUENCIES)[number],
        })
        await SubscriptionRepository.addMatchDescription(userId, sub.id, normalized)
        created++

        const matchingTxs = await TransactionRepository.findByDescriptionPattern(userId, normalized)
        for (const tx of matchingTxs) {
          if (tx.subscriptionId) continue
          await SubscriptionRepository.linkTransaction(userId, tx.id, sub.id)
        }
      }
    }
    return { created }
  },

  async confirmMatch(userId: string, id: string, description: string, transactionId?: string) {
    await SubscriptionService.getById(userId, id)
    const normalizedDesc = normalizeDescription(description)

    if (transactionId) {
      const existingSubId = await SubscriptionRepository.findTransactionSubscriptionId(userId, transactionId)
      if (existingSubId && existingSubId !== id) {
        throw new BadRequestError('Transaction already linked to another subscription')
      }
      await SubscriptionRepository.linkTransaction(userId, transactionId, id)
    }

    return SubscriptionRepository.addMatchDescription(userId, id, normalizedDesc)
  },

  async getConflicts(userId: string) {
    return SubscriptionRepository.findAllConflicts(userId)
  },

  async resolveConflict(userId: string, id: string, subscriptionId: string) {
    const conflict = await SubscriptionRepository.findConflictById(userId, id)
    if (!conflict) throw new NotFoundError('Conflict')
    if (conflict.resolved) throw new BadRequestError('Conflict already resolved')

    const result = await SubscriptionRepository.resolveConflict(userId, id, subscriptionId)
    if (!result) throw new BadRequestError('Could not resolve conflict')
    return result
  },
}
