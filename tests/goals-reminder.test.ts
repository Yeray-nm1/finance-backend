import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/modules/goals/goals.repository', () => ({
  GoalRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    sumContributions: vi.fn(),
    cancelPendingReminder: vi.fn(),
  },
}))

vi.mock('../src/modules/accounts/accounts.service', () => ({
  AccountService: {
    getById: vi.fn(),
    getOwnedId: vi.fn(),
  },
}))

import { AccountService } from '../src/modules/accounts/accounts.service'
import { GoalRepository } from '../src/modules/goals/goals.repository'
import { GoalService } from '../src/modules/goals/goals.service'

const repo = vi.mocked(GoalRepository)
const accounts = vi.mocked(AccountService)
const now = new Date('2026-11-18T12:00:00.000Z')

const account = { id: 'a1', name: 'Ahorro', type: 'savings' }

function storedGoal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    userId: 'u1',
    name: 'Viaje a Japón',
    targetAmount: 1000,
    targetDate: null,
    accountId: 'a1',
    account,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
    contributions: [],
    reminderDay: null,
    reminderAmount: null,
    ...overrides,
  }
}

const baseInput = {
  name: 'Viaje a Japón',
  targetAmount: 1000,
  accountId: 'a1',
}

beforeEach(() => {
  vi.clearAllMocks()
  accounts.getById.mockResolvedValue(account as never)
  repo.create.mockImplementation(async (_userId, dto) => storedGoal({
    reminderDay: dto.reminderDay ?? null,
    reminderAmount: dto.reminderAmount ?? null,
  }) as never)
  repo.findById.mockResolvedValue(storedGoal() as never)
  repo.update.mockImplementation(async (_userId, _id, dto) => storedGoal({
    reminderDay: dto.reminderDay ?? null,
    reminderAmount: dto.reminderAmount ?? null,
  }) as never)
})

describe('metas · recordatorio mensual', () => {
  it('guarda y devuelve el día y el importe sugerido al crear', async () => {
    const result = await GoalService.create('u1', {
      ...baseInput,
      reminderDay: 18,
      reminderAmount: 100.5,
    })

    expect(repo.create).toHaveBeenCalledWith('u1', expect.objectContaining({
      reminderDay: 18,
      reminderAmount: 100.5,
    }))
    expect(result).toMatchObject({ reminderDay: 18, reminderAmount: 100.5 })
  })

  it('acepta crear sin recordatorio', async () => {
    const result = await GoalService.create('u1', baseInput)

    expect(result).toMatchObject({ reminderDay: null, reminderAmount: null })
  })

  it.each([0, 32, 1.5, -1])('rechaza el día %s', async (reminderDay) => {
    await expect(
      GoalService.create('u1', { ...baseInput, reminderDay })
    ).rejects.toThrow('El día del recordatorio debe estar entre 1 y 31')
  })

  it('rechaza un día que no sea entero escrito como texto', async () => {
    await expect(
      GoalService.create('u1', { ...baseInput, reminderDay: '18' })
    ).rejects.toThrow('El día del recordatorio debe estar entre 1 y 31')
  })

  it.each([0, -5, '100'])('rechaza el importe sugerido %s', async (reminderAmount) => {
    await expect(
      GoalService.create('u1', { ...baseInput, reminderAmount })
    ).rejects.toThrow('El importe sugerido debe ser un número mayor que cero')
  })

  it('permite borrar el recordatorio al editar con null', async () => {
    repo.findById.mockResolvedValue(storedGoal({ reminderDay: 18, reminderAmount: 100 }) as never)

    await GoalService.update('u1', 'g1', { reminderDay: null, reminderAmount: null })

    expect(repo.update).toHaveBeenCalledWith('u1', 'g1', expect.objectContaining({
      reminderDay: null,
      reminderAmount: null,
    }))
  })

  it('no toca el recordatorio si el update no lo incluye', async () => {
    await GoalService.update('u1', 'g1', { name: 'Otro nombre' })

    const dto = vi.mocked(repo.update).mock.calls[0][2]
    expect(dto).not.toHaveProperty('reminderDay')
    expect(dto).not.toHaveProperty('reminderAmount')
  })

  it('rechaza un día inválido al editar', async () => {
    await expect(
      GoalService.update('u1', 'g1', { reminderDay: 32 })
    ).rejects.toThrow('El día del recordatorio debe estar entre 1 y 31')
  })
})
