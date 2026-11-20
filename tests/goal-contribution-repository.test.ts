import { beforeEach, describe, expect, it, vi } from 'vitest'

const { tx, prismaMock } = vi.hoisted(() => {
  const tx = {
    goalContribution: { update: vi.fn() },
    transaction: { create: vi.fn() },
    notification: { upsert: vi.fn() },
    savingsGoal: { update: vi.fn() },
  }
  const prismaMock = {
    goalContribution: { findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  }
  return { tx, prismaMock }
})

vi.mock('../src/core/db', () => ({ prisma: prismaMock }))

import { GoalContributionRepository } from '../src/modules/goal-contributions/goal-contributions.repository'

const input = {
  userId: 'u1',
  goalId: 'g1',
  period: 'M:2026-11',
  amount: 125.5,
  goalAccountId: 'a1',
  sourceAccountId: 'checking',
  date: new Date('2026-11-18T12:00:00.000Z'),
  description: 'Aportación a Viaje a Japón',
  hash: 'hash',
  updateSuggestion: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  tx.goalContribution.update.mockResolvedValue({ id: 'c1' })
  tx.transaction.create.mockResolvedValue({ id: 't1' })
  tx.notification.upsert.mockResolvedValue({ id: 'n1' })
  tx.savingsGoal.update.mockResolvedValue({ id: 'g1' })
})

describe('GoalContributionRepository.acceptInTransaction', () => {
  it('CA-WI3.2 / 4A guarda el importe confirmado sin crear notificación de confirmación', async () => {
    await GoalContributionRepository.acceptInTransaction(input)

    expect(prismaMock.$transaction).toHaveBeenCalledOnce()
    expect(tx.goalContribution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'accepted', amount: 125.5 }),
      })
    )
    expect(tx.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: -125.5, goalId: 'g1' }) })
    )
    expect(tx.notification.upsert).not.toHaveBeenCalled()
  })

  it('4A conserva el upsert idempotente si se entrega una notificación legada', async () => {
    await GoalContributionRepository.acceptInTransaction({
      ...input,
      notificationKey: 'goal_contribution_accepted:g1:2026-11',
      notificationTitle: 'Aportación confirmada: Viaje a Japón',
      notificationBody: 'Se ha registrado la aportación de 125,50 €.',
    })

    expect(tx.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          key: 'goal_contribution_accepted:g1:2026-11',
          body: 'Se ha registrado la aportación de 125,50 €.',
        }),
      })
    )
  })

  it('CA-WI3.3 con updateSuggestion actualiza reminderAmount en la misma transacción', async () => {
    await GoalContributionRepository.acceptInTransaction({ ...input, updateSuggestion: true })

    expect(tx.savingsGoal.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { reminderAmount: 125.5 },
    })
  })

  it('CA-WI3.3 sin updateSuggestion no toca la sugerencia de la meta', async () => {
    await GoalContributionRepository.acceptInTransaction(input)

    expect(tx.savingsGoal.update).not.toHaveBeenCalled()
  })
})
