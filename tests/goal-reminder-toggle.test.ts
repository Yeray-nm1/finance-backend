import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
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

const savingsAccount = { id: 'a1', name: 'Ahorro', type: 'savings' }

function storedGoal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    userId: 'u1',
    name: 'Viaje a Japón',
    targetAmount: 1000,
    targetDate: null,
    accountId: 'a1',
    account: savingsAccount,
    isArchived: false,
    reminderEnabled: false,
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
  accounts.getById.mockResolvedValue(savingsAccount as never)
  repo.create.mockImplementation(async (_userId, dto) => storedGoal({
    accountId: dto.accountId ?? null,
    reminderDay: dto.reminderDay ?? null,
    reminderAmount: dto.reminderAmount ?? null,
    reminderEnabled: 'reminderEnabled' in dto ? dto.reminderEnabled : false,
  }) as never)
  repo.findById.mockResolvedValue(storedGoal() as never)
  repo.update.mockImplementation(async (_userId, _id, dto) => storedGoal({
    reminderDay: dto.reminderDay ?? null,
    reminderAmount: dto.reminderAmount ?? null,
    reminderEnabled: 'reminderEnabled' in dto ? dto.reminderEnabled : false,
  }) as never)
})

describe('WI-1/WI-5 · toggle de recordatorio por meta', () => {
  it('guarda y serializa reminderEnabled con día y sin importe al crear', async () => {
    const result = await GoalService.create('u1', {
      ...baseInput,
      reminderEnabled: true,
      reminderDay: 18,
    })

    expect(repo.create).toHaveBeenCalledWith('u1', expect.objectContaining({
      reminderEnabled: true,
      reminderDay: 18,
      reminderAmount: null,
    }))
    expect(result).toMatchObject({ reminderEnabled: true, reminderDay: 18, reminderAmount: null })
  })

  it('guarda y serializa reminderEnabled al editar', async () => {
    const result = await GoalService.update('u1', 'g1', {
      reminderEnabled: true,
      reminderDay: 5,
      reminderAmount: 75,
    })

    expect(repo.update).toHaveBeenCalledWith('u1', 'g1', expect.objectContaining({
      reminderEnabled: true,
      reminderDay: 5,
      reminderAmount: 75,
    }))
    expect(result).toMatchObject({ reminderEnabled: true, reminderDay: 5, reminderAmount: 75 })
  })

  it('una meta nueva queda sin avisos por defecto', async () => {
    const result = await GoalService.create('u1', baseInput)

    expect(repo.create).toHaveBeenCalledWith('u1', expect.objectContaining({
      reminderEnabled: false,
    }))
    expect(result).toMatchObject({ reminderEnabled: false, reminderDay: null, reminderAmount: null })
  })

  it('rechaza encender el recordatorio sin día', async () => {
    await expect(
      GoalService.create('u1', { ...baseInput, reminderEnabled: true })
    ).rejects.toThrow('El aviso mensual requiere un día o el último día del mes')

    expect(repo.create).not.toHaveBeenCalled()
  })

  it('rechaza encender el recordatorio sin cuenta de ahorro', async () => {
    await expect(
      GoalService.create('u1', {
        ...baseInput,
        accountId: null,
        reminderEnabled: true,
        reminderDay: 18,
      })
    ).rejects.toThrow('El recordatorio de la meta requiere una cuenta de ahorro')

    expect(repo.create).not.toHaveBeenCalled()
  })

  it('permite apagar el recordatorio al editar', async () => {
    await GoalService.update('u1', 'g1', { reminderEnabled: false })

    expect(repo.update).toHaveBeenCalledWith('u1', 'g1', expect.objectContaining({
      reminderEnabled: false,
    }))
  })

  it.each([0, 32, 1.5, -1])('rechaza el día %s aunque el toggle esté apagado', async (reminderDay) => {
    await expect(
      GoalService.create('u1', { ...baseInput, reminderDay })
    ).rejects.toThrow('El día del recordatorio debe estar entre 1 y 31')
  })

  it.each([0, -5, '100'])('rechaza el importe sugerido %s', async (reminderAmount) => {
    await expect(
      GoalService.create('u1', { ...baseInput, reminderAmount })
    ).rejects.toThrow('El importe sugerido debe ser un número mayor que cero')
  })
})

describe('WI-1 · esquema y migración', () => {
  const schemaPath = resolve(process.cwd(), 'src/prisma/schema.prisma')
  const migrationsPath = resolve(process.cwd(), 'src/prisma/migrations')

  function schema(): string {
    return readFileSync(schemaPath, 'utf8')
  }

  function migration(): string {
    const folder = readdirSync(migrationsPath).find((name) => name.includes('unify_goal_reminders'))
    if (!folder) return ''
    return readFileSync(resolve(migrationsPath, folder, 'migration.sql'), 'utf8')
  }

  it('SavingsGoal tiene reminderEnabled con default false y ya no tiene contributionScheduled', () => {
    expect(schema()).toMatch(/reminderEnabled\s+Boolean\s+@default\(false\)/)
    expect(schema()).not.toMatch(/contributionScheduled/)
    expect(migration()).toMatch(/ADD COLUMN\s+"reminderEnabled" BOOLEAN NOT NULL DEFAULT false/)
    expect(migration()).toMatch(/DROP COLUMN\s+"contributionScheduled"/)
  })

  it('GoalContribution.amount admite null', () => {
    expect(schema()).toMatch(/amount\s+Float\?/)
    expect(migration()).toMatch(/ALTER COLUMN "amount" DROP NOT NULL/)
  })

  it('la migración cancela las pendientes y sus notificaciones sin borrar las aceptadas', () => {
    const sql = migration()
    expect(sql).toMatch(/DELETE FROM "Notification"[\s\S]*'goal_contribution:'/)
    expect(sql).toMatch(/DELETE FROM "GoalContribution"[\s\S]*status.*=.*'pending'/i)
  })
})
