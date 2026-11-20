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
const baseInput = { name: 'Viaje a Japón', targetAmount: 1000, accountId: 'a1', reminderEnabled: true }

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
    reminderFrequency: 'MONTHLY',
    reminderChannel: 'APP_AND_EMAIL',
    reminderWeekday: null,
    reminderDay: 18,
    reminderLastDay: false,
    reminderInterval: null,
    reminderIntervalUnit: null,
    reminderStartDate: null,
    reminderAmount: null,
    reminderEnabled: true,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  accounts.getById.mockResolvedValue(account as never)
  repo.create.mockImplementation(async (_userId, dto) => storedGoal(dto) as never)
  repo.findById.mockResolvedValue(storedGoal() as never)
  repo.update.mockImplementation(async (_userId, _id, dto) => storedGoal(dto) as never)
  repo.cancelPendingReminder.mockResolvedValue(undefined as never)
})

describe('validación por frecuencia', () => {
  it('CA-10 semanal exige día de la semana y guarda el resto a null', async () => {
    const result = await GoalService.create('u1', {
      ...baseInput,
      reminderFrequency: 'WEEKLY',
      reminderWeekday: 5,
      reminderDay: 18,
    })

    expect(repo.create).toHaveBeenCalledWith('u1', expect.objectContaining({
      reminderFrequency: 'WEEKLY',
      reminderWeekday: 5,
      reminderDay: null,
      reminderLastDay: false,
      reminderInterval: null,
      reminderIntervalUnit: null,
      reminderStartDate: null,
    }))
    expect(result.reminderWeekday).toBe(5)
  })

  it('CA-10 semanal sin día de la semana falla', async () => {
    await expect(
      GoalService.create('u1', { ...baseInput, reminderFrequency: 'WEEKLY' })
    ).rejects.toThrow('El aviso semanal requiere un día de la semana')
  })

  it('CA-10 mensual admite días hasta el 31 y el último día del mes', async () => {
    await GoalService.create('u1', { ...baseInput, reminderDay: 31 })
    await GoalService.create('u1', {
      ...baseInput,
      reminderDay: null,
      reminderLastDay: true,
    })

    expect(repo.create).toHaveBeenNthCalledWith(1, 'u1', expect.objectContaining({
      reminderFrequency: 'MONTHLY',
      reminderDay: 31,
    }))
    expect(repo.create).toHaveBeenNthCalledWith(2, 'u1', expect.objectContaining({
      reminderLastDay: true,
      reminderDay: null,
    }))
  })

  it('CA-10 mensual sin día ni último día falla', async () => {
    await expect(
      GoalService.create('u1', { ...baseInput, reminderDay: null })
    ).rejects.toThrow('El aviso mensual requiere un día o el último día del mes')
  })

  it('CA-10 personalizada exige intervalo, unidad y fecha de inicio', async () => {
    const result = await GoalService.create('u1', {
      ...baseInput,
      reminderFrequency: 'CUSTOM',
      reminderInterval: 2,
      reminderIntervalUnit: 'WEEKS',
      reminderStartDate: '2026-12-05T00:00:00.000Z',
      reminderDay: 18,
    })

    expect(repo.create).toHaveBeenCalledWith('u1', expect.objectContaining({
      reminderFrequency: 'CUSTOM',
      reminderInterval: 2,
      reminderIntervalUnit: 'WEEKS',
      reminderStartDate: new Date('2026-12-05T00:00:00.000Z'),
      reminderDay: null,
    }))
    expect(result.reminderInterval).toBe(2)
  })

  it.each([
    ['sin intervalo', { reminderIntervalUnit: 'DAYS', reminderStartDate: '2026-12-05' }],
    ['sin unidad', { reminderInterval: 2, reminderStartDate: '2026-12-05' }],
    ['sin fecha', { reminderInterval: 2, reminderIntervalUnit: 'DAYS' }],
    ['intervalo cero', { reminderInterval: 0, reminderIntervalUnit: 'DAYS', reminderStartDate: '2026-12-05' }],
  ])('CA-10 personalizada %s falla', async (_case, patch) => {
    await expect(
      GoalService.create('u1', { ...baseInput, reminderFrequency: 'CUSTOM', ...patch })
    ).rejects.toThrow()
  })

  it('CA-10 rechaza frecuencia o canal desconocidos', async () => {
    await expect(
      GoalService.create('u1', { ...baseInput, reminderFrequency: 'YEARLY' })
    ).rejects.toThrow()
    await expect(
      GoalService.create('u1', { ...baseInput, reminderChannel: 'EMAIL_ONLY' })
    ).rejects.toThrow()
  })
})

describe('cancelación del pendiente al cambiar la programación', () => {
  it('CA-15 cambiar la frecuencia cancela la aportación pendiente', async () => {
    await GoalService.update('u1', 'g1', { reminderFrequency: 'WEEKLY', reminderWeekday: 5 })

    expect(repo.cancelPendingReminder).toHaveBeenCalledWith('u1', 'g1')
  })

  it('CA-15 cambiar solo el canal también cancela el pendiente', async () => {
    await GoalService.update('u1', 'g1', { reminderChannel: 'APP_ONLY' })

    expect(repo.cancelPendingReminder).toHaveBeenCalledWith('u1', 'g1')
  })

  it('CA-15 cambiar el importe sugerido no cancela el pendiente', async () => {
    await GoalService.update('u1', 'g1', { reminderAmount: 50 })

    expect(repo.cancelPendingReminder).not.toHaveBeenCalled()
  })

  it('CA-15 las aportaciones aceptadas no se borran', async () => {
    expect(repo.cancelPendingReminder).not.toHaveBeenCalled()

    await GoalService.update('u1', 'g1', { reminderFrequency: 'MONTHLY', reminderDay: 20 })

    expect(repo.cancelPendingReminder).toHaveBeenCalledTimes(1)
  })

  it('CA-10 la respuesta serialization expone todos los campos de aviso', async () => {
    const result = await GoalService.create('u1', {
      ...baseInput,
      reminderFrequency: 'CUSTOM',
      reminderInterval: 3,
      reminderIntervalUnit: 'MONTHS',
      reminderStartDate: '2026-12-05T00:00:00.000Z',
      reminderChannel: 'APP_ONLY',
    })

    expect(result).toMatchObject({
      reminderFrequency: 'CUSTOM',
      reminderChannel: 'APP_ONLY',
      reminderInterval: 3,
      reminderIntervalUnit: 'MONTHS',
      reminderLastDay: false,
    })
  })
})
