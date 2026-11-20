import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/modules/goal-contributions/goal-contributions.repository', () => ({
  GoalContributionRepository: {
    findByPeriod: vi.fn(),
    acceptInTransaction: vi.fn(),
  },
}))

vi.mock('../src/modules/accounts/accounts.service', () => ({
  AccountService: {
    getAll: vi.fn(),
  },
}))

import { AccountService } from '../src/modules/accounts/accounts.service'
import { GoalContributionRepository } from '../src/modules/goal-contributions/goal-contributions.repository'
import { GoalContributionService } from '../src/modules/goal-contributions/goal-contributions.service'
import { createTransactionHash } from '../src/utils/hash'
import { createGoalContributionToken, verifyGoalContributionToken } from '../src/utils/goal-contribution-token'

const repo = vi.mocked(GoalContributionRepository)
const accounts = vi.mocked(AccountService)
const NOW = new Date('2026-11-18T12:00:00.000Z')
const PERIOD = 'M:2026-11'

function pending(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    userId: 'u1',
    goalId: 'g1',
    period: PERIOD,
    amount: 100,
    goalAccountId: 'a1',
    status: 'pending',
    sourceAccountId: null,
    acceptedAt: null,
    createdAt: NOW,
    goal: {
      name: 'Viaje a Japón',
      reminderEnabled: true,
      reminderFrequency: 'MONTHLY',
      reminderDay: 18,
      reminderWeekday: null,
      reminderLastDay: false,
      reminderInterval: null,
      reminderIntervalUnit: null,
      reminderStartDate: null,
    },
    ...overrides,
  }
}

const candidateAccounts = [
  { id: 'checking', name: 'Cuenta corriente', type: 'checking', userId: 'u1', createdAt: NOW },
  { id: 'a1', name: 'Ahorro', type: 'savings', userId: 'u1', createdAt: NOW },
]

beforeEach(() => {
  vi.clearAllMocks()
  repo.findByPeriod.mockResolvedValue(pending() as never)
  repo.acceptInTransaction.mockImplementation(async (input) => ({
    contribution: {
      ...pending(),
      status: 'accepted',
      sourceAccountId: input.sourceAccountId,
      acceptedAt: NOW,
      amount: input.amount,
    },
    transaction: {
      id: 't1',
      amount: -input.amount,
      description: input.description,
      date: input.date,
      createdAt: NOW,
      account: candidateAccounts[0],
      transferAccount: candidateAccounts[1],
    },
  }) as never)
  accounts.getAll.mockResolvedValue(candidateAccounts as never)
})

describe('token de aceptación de aportación', () => {
  it('CA-4.1 es determinista y no incluye iat, exp ni jti', () => {
    const token = createGoalContributionToken('u1', 'g1', PERIOD)

    expect(createGoalContributionToken('u1', 'g1', PERIOD)).toBe(token)

    const payload = verifyGoalContributionToken(token)
    expect(payload).toMatchObject({
      sub: 'u1',
      scope: 'goal_contribution',
      goalId: 'g1',
      period: PERIOD,
    })
    expect(payload).not.toHaveProperty('iat')
    expect(payload).not.toHaveProperty('exp')
    expect(payload).not.toHaveProperty('jti')
  })

  it('CA-4.6 rechaza tokens manipulados y de otro scope', () => {
    expect(verifyGoalContributionToken('token-invalido')).toBeNull()
    expect(verifyGoalContributionToken(`${createGoalContributionToken('u1', 'g1', PERIOD)}x`)).toBeNull()
  })
})

describe('aviso de meta · consulta y aceptación', () => {
  const token = createGoalContributionToken('u1', 'g1', PERIOD)

  it('CA-WI3.1 el GET devuelve la sugerencia, periodo, meta, estado y cuentas sin la destino', async () => {
    const result = await GoalContributionService.getPending('u1', token)

    expect(result).toMatchObject({
      id: 'c1',
      goalId: 'g1',
      amount: 100,
      period: PERIOD,
      goalName: 'Viaje a Japón',
      status: 'pending',
      accounts: [expect.objectContaining({ id: 'checking' })],
    })
    expect(result.accounts.some((account) => account.id === 'a1')).toBe(false)
  })

  it('CA-WI3.1 el GET devuelve amount null si la meta no tiene sugerencia', async () => {
    repo.findByPeriod.mockResolvedValue(pending({ amount: null }) as never)

    const result = await GoalContributionService.getPending('u1', token)

    expect(result.amount).toBeNull()
  })

  it('CA-4.3 un token de otro usuario no permite consultar ni aceptar', async () => {
    await expect(GoalContributionService.getPending('otro', token)).rejects.toThrow('Enlace de aportación no válido')
    await expect(
      GoalContributionService.accept('otro', token, 'checking', { amount: 25 }, NOW)
    ).rejects.toThrow('Enlace de aportación no válido')
    expect(repo.acceptInTransaction).not.toHaveBeenCalled()
  })

  it('CA-WI3.2 aceptar con importe editado crea la transferencia por ese importe', async () => {
    const result = await GoalContributionService.accept(
      'u1', token, 'checking', { amount: 125.5, updateSuggestion: false }, NOW
    )

    expect(repo.acceptInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        goalId: 'g1',
        period: PERIOD,
        amount: 125.5,
        goalAccountId: 'a1',
        sourceAccountId: 'checking',
        date: NOW,
        description: 'Aportación a Viaje a Japón',
        hash: createTransactionHash(NOW.toISOString(), -125.5, `goal_contribution:g1:${PERIOD}`),
        updateSuggestion: false,
      })
    )
    const sent = repo.acceptInTransaction.mock.calls[0][0]
    expect(sent).not.toHaveProperty('notificationKey')
    expect(sent).not.toHaveProperty('notificationTitle')
    expect(sent).not.toHaveProperty('notificationBody')
    expect(result).toMatchObject({
      status: 'accepted',
      amount: 125.5,
      sourceAccountId: 'checking',
      alreadyAccepted: false,
    })
  })

  it('CA-WI3.3 updateSuggestion se propaga a la transacción', async () => {
    await GoalContributionService.accept('u1', token, 'checking', { amount: 25, updateSuggestion: true }, NOW)

    expect(repo.acceptInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 25, updateSuggestion: true })
    )
  })

  it('CA-WI3.5 repetir la aceptación no crea otra transferencia', async () => {
    repo.findByPeriod.mockResolvedValue(pending({
      status: 'accepted',
      sourceAccountId: 'checking',
      acceptedAt: NOW,
      amount: 25,
    }) as never)

    const result = await GoalContributionService.accept(
      'u1', token, 'checking', { amount: 25 }, NOW
    )

    expect(result).toMatchObject({ status: 'accepted', alreadyAccepted: true })
    expect(repo.acceptInTransaction).not.toHaveBeenCalled()
  })

  it.each([
    ['cero', 0],
    ['negativo', -5],
    ['no finito', Number.NaN],
    ['ausente', undefined],
    ['texto', '100'],
  ])('CA-WI3.4 rechaza el importe %s sin efectos', async (_case, amount) => {
    await expect(
      GoalContributionService.accept('u1', token, 'checking', { amount }, NOW)
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(repo.acceptInTransaction).not.toHaveBeenCalled()
  })

  it.each([
    ['no propia', 'desconocida', 'La cuenta origen no es válida'],
    ['igual a la destino', 'a1', 'La cuenta origen debe ser distinta de la cuenta de la meta'],
  ])('CA-WI3.4 rechaza cuenta %s sin efectos', async (_case, accountId, message) => {
    await expect(
      GoalContributionService.accept('u1', token, accountId, { amount: 25 }, NOW)
    ).rejects.toThrow(message)
    expect(repo.acceptInTransaction).not.toHaveBeenCalled()
  })

  it('CA-WI3.4 rechaza un periodo ya cerrado', async () => {
    const oldToken = createGoalContributionToken('u1', 'g1', 'M:2026-10')

    await expect(
      GoalContributionService.accept('u1', oldToken, 'checking', { amount: 25 }, NOW)
    ).rejects.toThrow('El periodo de la aportación ya ha terminado')
    expect(repo.acceptInTransaction).not.toHaveBeenCalled()
  })

  it('CA-16 el enlace sigue vigente hasta la siguiente ocurrencia', async () => {
    await expect(
      GoalContributionService.accept(
        'u1',
        token,
        'checking',
        { amount: 25 },
        new Date('2026-11-30T12:00:00.000Z')
      )
    ).resolves.toMatchObject({ status: 'accepted' })

    await expect(
      GoalContributionService.getPending('u1', token)
    ).resolves.toMatchObject({ period: PERIOD })
  })

  it('CA-16 getPending rechaza un periodo que ya no es el vigente', async () => {
    const oldToken = createGoalContributionToken('u1', 'g1', 'M:2026-10')
    repo.findByPeriod.mockResolvedValue(pending({ period: 'M:2026-10' }) as never)

    await expect(GoalContributionService.getPending('u1', oldToken)).rejects.toThrow(
      'El periodo de la aportación ya ha terminado'
    )
  })

  it('CA-16 el periodo semanal caduca al cambiar de semana', async () => {
    const weeklyToken = createGoalContributionToken('u1', 'g1', 'W:2026-11-13')
    repo.findByPeriod.mockResolvedValue(pending({
      period: 'W:2026-11-13',
      goal: {
        name: 'Viaje a Japón',
        reminderEnabled: true,
        reminderFrequency: 'WEEKLY',
        reminderDay: null,
        reminderWeekday: 5,
        reminderLastDay: false,
        reminderInterval: null,
        reminderIntervalUnit: null,
        reminderStartDate: null,
      },
    }) as never)

    await expect(
      GoalContributionService.accept(
        'u1',
        weeklyToken,
        'checking',
        { amount: 25 },
        new Date('2026-11-21T12:00:00.000Z')
      )
    ).rejects.toThrow('El periodo de la aportación ya ha terminado')
  })

  it('CA-WI3.6 apagar el toggle de la meta no invalida una aportación ya generada', async () => {
    repo.findByPeriod.mockResolvedValue(pending({
      goal: {
        name: 'Viaje a Japón',
        reminderEnabled: false,
        reminderFrequency: 'MONTHLY',
        reminderDay: 18,
        reminderWeekday: null,
        reminderLastDay: false,
        reminderInterval: null,
        reminderIntervalUnit: null,
        reminderStartDate: null,
      },
    }) as never)

    const result = await GoalContributionService.accept(
      'u1', token, 'checking', { amount: 25 }, NOW
    )

    expect(result).toMatchObject({ status: 'accepted', alreadyAccepted: false })
    expect(repo.acceptInTransaction).toHaveBeenCalled()
  })

  it('CA-WI3.4 una aportación inexistente responde 409', async () => {
    repo.findByPeriod.mockResolvedValue(null as never)

    await expect(
      GoalContributionService.accept('u1', token, 'checking', { amount: 25 }, NOW)
    ).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('rutas de aceptación de aportación', () => {
  const routesPath = resolve(process.cwd(), 'src/modules/goal-contributions/goal-contributions.routes.ts')
  const appPath = resolve(process.cwd(), 'src/app.ts')

  it('registra GET pending y POST accept', () => {
    const routes = readFileSync(routesPath, 'utf8')
    expect(routes).toContain("router.get('/pending'")
    expect(routes).toContain("router.post('/accept'")
  })

  it('monta las rutas después del middleware de autenticación', () => {
    const app = readFileSync(appPath, 'utf8')
    expect(app.indexOf('app.use(authMiddleware)')).toBeLessThan(app.indexOf("app.use('/api/v1/goal-contributions'"))
  })
})
