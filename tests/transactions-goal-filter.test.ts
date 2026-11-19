import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock, serviceMock } = vi.hoisted(() => ({
  prismaMock: {
    transaction: { findMany: vi.fn(), count: vi.fn() },
  },
  serviceMock: { getAll: vi.fn() },
}))

vi.mock('../src/core/db', () => ({ prisma: prismaMock }))
vi.mock('../src/modules/transactions/transactions.service', () => ({
  TransactionService: serviceMock,
}))

import { TransactionController } from '../src/modules/transactions/transactions.controller'
import { TransactionRepository } from '../src/modules/transactions/transactions.repository'

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.transaction.findMany.mockResolvedValue([])
  prismaMock.transaction.count.mockResolvedValue(0)
  serviceMock.getAll.mockResolvedValue({ data: [], total: 0 })
})

describe('3B filtro de movimientos por meta', () => {
  it('el controlador lee goalId del query y lo pasa al servicio', async () => {
    const req = { userId: 'u1', query: { goalId: 'goal-1', month: '2026-11' } }
    const res = { json: vi.fn() }

    await TransactionController.getAll(req as never, res as never)

    expect(serviceMock.getAll).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ goalId: 'goal-1' })
    )
    expect(res.json).toHaveBeenCalledWith({ data: [], total: 0 })
  })

  it('el repositorio añade la condición goalId a la consulta', async () => {
    await TransactionRepository.findWithFilters('u1', { goalId: 'goal-1' })

    const where = prismaMock.transaction.findMany.mock.calls[0][0].where
    expect(where.AND).toContainEqual({ goalId: 'goal-1' })
    expect(prismaMock.transaction.count).toHaveBeenCalledWith({ where })
  })

  it('sin goalId no añade la condición', async () => {
    await TransactionRepository.findWithFilters('u1', {})

    const where = prismaMock.transaction.findMany.mock.calls[0][0].where
    expect(where.AND).toBeUndefined()
  })
})
