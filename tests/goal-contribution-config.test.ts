import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/modules/goals/goals.repository', () => ({
  GoalRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    sumContributions: vi.fn(),
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
    contributionScheduled: false,
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
    contributionScheduled: 'contributionScheduled' in dto ? dto.contributionScheduled : false,
  }) as never)
  repo.findById.mockResolvedValue(storedGoal() as never)
  repo.update.mockImplementation(async (_userId, _id, dto) => storedGoal({
    reminderDay: dto.reminderDay ?? null,
    reminderAmount: dto.reminderAmount ?? null,
    contributionScheduled: 'contributionScheduled' in dto ? dto.contributionScheduled : false,
  }) as never)
})

describe('metas · aportación programada (configuración)', () => {
  it('CA-2.1 guarda y serializa contributionScheduled con día e importe reales al crear', async () => {
    const result = await GoalService.create('u1', {
      ...baseInput,
      contributionScheduled: true,
      reminderDay: 18,
      reminderAmount: 100.5,
    })

    expect(repo.create).toHaveBeenCalledWith('u1', expect.objectContaining({
      contributionScheduled: true,
      reminderDay: 18,
      reminderAmount: 100.5,
    }))
    expect(result).toMatchObject({
      contributionScheduled: true,
      reminderDay: 18,
      reminderAmount: 100.5,
    })
  })

  it('CA-2.1 guarda y serializa contributionScheduled al editar', async () => {
    const result = await GoalService.update('u1', 'g1', {
      contributionScheduled: true,
      reminderDay: 5,
      reminderAmount: 75,
    })

    expect(repo.update).toHaveBeenCalledWith('u1', 'g1', expect.objectContaining({
      contributionScheduled: true,
      reminderDay: 5,
      reminderAmount: 75,
    }))
    expect(result).toMatchObject({ contributionScheduled: true, reminderDay: 5, reminderAmount: 75 })
  })

  it.each([
    ['sin importe', undefined],
    ['importe cero', 0],
    ['importe negativo', -10],
  ])('CA-2.2 rechaza programar %s', async (_case, reminderAmount) => {
    await expect(
      GoalService.create('u1', {
        ...baseInput,
        contributionScheduled: true,
        reminderDay: 18,
        reminderAmount,
      })
    ).rejects.toThrow('La aportación programada requiere un importe mayor que cero')

    expect(repo.create).not.toHaveBeenCalled()
  })

  it('CA-2.2 rechaza programar sin día del mes', async () => {
    await expect(
      GoalService.create('u1', {
        ...baseInput,
        contributionScheduled: true,
        reminderAmount: 100,
      })
    ).rejects.toThrow('La aportación programada requiere un día entre 1 y 28')

    expect(repo.create).not.toHaveBeenCalled()
  })

  it('CA-2.3 rechaza programar sin cuenta de ahorro', async () => {
    await expect(
      GoalService.create('u1', {
        ...baseInput,
        accountId: null,
        contributionScheduled: true,
        reminderDay: 18,
        reminderAmount: 100,
      })
    ).rejects.toThrow('La aportación programada requiere una cuenta de ahorro')

    expect(repo.create).not.toHaveBeenCalled()
  })

  it('CA-2.4 acepta una meta no programada sin día ni importe', async () => {
    const result = await GoalService.create('u1', baseInput)

    expect(repo.create).toHaveBeenCalledWith('u1', expect.objectContaining({
      contributionScheduled: false,
    }))
    expect(result).toMatchObject({ contributionScheduled: false, reminderDay: null, reminderAmount: null })
  })

  it('CA-2.4 permite desactivar la programación al editar', async () => {
    await GoalService.update('u1', 'g1', { contributionScheduled: false })

    expect(repo.update).toHaveBeenCalledWith('u1', 'g1', expect.objectContaining({
      contributionScheduled: false,
    }))
  })
})

describe('esquema · aportación programada', () => {
  const schemaPath = resolve(process.cwd(), 'src/prisma/schema.prisma')
  const migrationsPath = resolve(process.cwd(), 'src/prisma/migrations')

  function schema(): string {
    return readFileSync(schemaPath, 'utf8')
  }

  function migration(): string {
    const folder = readdirSync(migrationsPath).find((name) => name.includes('goal_contribution'))
    if (!folder) return ''
    return readFileSync(resolve(migrationsPath, folder, 'migration.sql'), 'utf8')
  }

  it('CA-2.5 SavingsGoal tiene contributionScheduled con valor por defecto false', () => {
    expect(schema()).toMatch(/contributionScheduled\s+Boolean\s+@default\(false\)/)
    expect(migration()).toMatch(/ADD COLUMN\s+"contributionScheduled" BOOLEAN NOT NULL DEFAULT false/)
  })

  it('CA-2.5 GoalContribution congela importe y destino y es única por meta y periodo', () => {
    const content = schema()
    expect(content).toMatch(/model GoalContribution \{/)
    expect(content).toMatch(/@@unique\(\[goalId, period\]\)/)
    for (const field of ['userId', 'goalId', 'period', 'amount', 'goalAccountId', 'status', 'sourceAccountId', 'acceptedAt']) {
      expect(content).toMatch(new RegExp(`\\b${field}\\b`))
    }
    expect(migration()).toMatch(/CREATE TABLE "GoalContribution"/)
    expect(migration()).toMatch(/UNIQUE INDEX[^\n]*\("goalId",\s*"period"\)/)
  })
})
