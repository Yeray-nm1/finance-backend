import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/modules/notifications/notifications.repository', () => ({
  NotificationRepository: {
    findRules: vi.fn(),
    saveRule: vi.fn(),
    list: vi.fn(),
    countUnread: vi.fn(),
    findUsersWithNotifications: vi.fn(),
    findActiveSubscriptions: vi.fn(),
    findLastCharge: vi.fn(),
    sumExpenses: vi.fn(),
    findGoalsWithReminder: vi.fn(),
    createNotifications: vi.fn(),
    findPendingEmailKeys: vi.fn(),
    markEmailsSent: vi.fn(),
    disableEmails: vi.fn(),
    ensureGoalContribution: vi.fn(),
  },
}))

import { NotificationRepository } from '../src/modules/notifications/notifications.repository'
import { NotificationService } from '../src/modules/notifications/notifications.service'

const repo = vi.mocked(NotificationRepository)
const NOW = new Date('2026-11-18T12:00:00.000Z')
const PERIOD = '2026-11'

const rules = {
  subscriptionDue: { enabled: false, emailEnabled: false, daysBefore: 3 as const },
  spendingSummary: { enabled: false, emailEnabled: false, frequency: 'weekly' as const },
  goalReminder: { enabled: true, emailEnabled: true },
}

function scheduledGoal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    name: 'Viaje a Japón',
    targetAmount: 1000,
    reminderDay: 18,
    reminderAmount: 100,
    saved: 250,
    accountId: 'a1',
    reminderEnabled: true,
    ...overrides,
  }
}

function senderStub() {
  return { send: vi.fn().mockResolvedValue(undefined) }
}

function ruleRows(enabled: boolean, emailEnabled = true) {
  return [
    { id: 'r1', userId: 'u1', type: 'goal_reminder', enabled, emailEnabled },
  ]
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  repo.findRules.mockResolvedValue(ruleRows(true) as never)
  repo.findUsersWithNotifications.mockResolvedValue([{ id: 'u1', email: 'user@example.com' }] as never)
  repo.findGoalsWithReminder.mockResolvedValue([scheduledGoal()] as never)
  repo.createNotifications.mockImplementation(async (_userId, items) => items as never)
  repo.findPendingEmailKeys.mockResolvedValue(new Set([`goal_contribution:g1:${PERIOD}`]) as never)
  repo.markEmailsSent.mockResolvedValue(undefined as never)
  repo.ensureGoalContribution.mockResolvedValue(true as never)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('aviso mensual unificado · generación', () => {
  it('CA-WI2.2 genera un único aviso sin importe y con el correo de la plantilla nueva', async () => {
    const notifications = await NotificationService.collectNotifications('u1', rules, NOW)

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      key: `goal_contribution:g1:${PERIOD}`,
      type: 'goal_contribution',
      title: 'Recordatorio de meta: Viaje a Japón',
      body: 'Tienes una aportación pendiente. Confírmala desde aquí.',
      email: { template: 'goal_contribution_accept' },
    })
    expect(notifications[0].body).not.toContain('100,00')
    expect(notifications[0].email?.data).toMatchObject({
      goalName: 'Viaje a Japón',
      period: PERIOD,
    })
    expect(notifications[0].email?.data).not.toHaveProperty('amount')
    expect(notifications.some((item) => item.type === 'goal_reminder')).toBe(false)
    expect(String(notifications[0].email?.data.acceptUrl)).toMatch(/\/goals\/aceptar\?token=/)
    expect(String(notifications[0].email?.data.unsubscribeUrl)).toContain('/api/v1/unsubscribe?token=')
  })

  it('CA-WI2.4 con reminderAmount null se crea la aportación y se emite el aviso igual', async () => {
    repo.findGoalsWithReminder.mockResolvedValue([scheduledGoal({ reminderAmount: null })] as never)

    const notifications = await NotificationService.collectNotifications('u1', rules, NOW)
    const sender = senderStub()
    await NotificationService.processAll(sender)

    expect(notifications).toHaveLength(1)
    expect(repo.ensureGoalContribution).toHaveBeenCalledWith({
      userId: 'u1',
      goalId: 'g1',
      period: PERIOD,
      amount: null,
      goalAccountId: 'a1',
    })
    expect(sender.send).toHaveBeenCalledOnce()
  })

  it('FIX-4 abrir la campana asegura la fila antes de crear el aviso con su enlace', async () => {
    repo.list.mockResolvedValue([] as never)
    repo.countUnread.mockResolvedValue(0 as never)

    await NotificationService.list('u1')

    expect(repo.ensureGoalContribution).toHaveBeenCalledWith({
      userId: 'u1',
      goalId: 'g1',
      period: PERIOD,
      amount: 100,
      goalAccountId: 'a1',
    })
    expect(repo.createNotifications).toHaveBeenCalledWith(
      'u1',
      expect.arrayContaining([
        expect.objectContaining({ key: `goal_contribution:g1:${PERIOD}` }),
      ])
    )
    expect(repo.ensureGoalContribution.mock.invocationCallOrder[0]).toBeLessThan(
      repo.createNotifications.mock.invocationCallOrder[0]
    )
  })

  it('FIX-2 el aviso in-app abre la misma aceptación que el correo', async () => {
    const notifications = await NotificationService.collectNotifications('u1', rules, NOW)
    const emailUrl = new URL(String(notifications[0].email?.data.acceptUrl))

    expect(notifications[0].actionUrl).toMatch(/^\/goals\/aceptar\?token=/)
    expect(notifications[0].actionUrl).toBe(`${emailUrl.pathname}${emailUrl.search}`)
  })

  it('CA-WI2.6 el barrido guarda la sugerencia, devuelve contadores y envía sin importe', async () => {
    const sender = senderStub()

    const result = await NotificationService.processAll(sender)

    expect(repo.ensureGoalContribution).toHaveBeenCalledWith({
      userId: 'u1',
      goalId: 'g1',
      period: PERIOD,
      amount: 100,
      goalAccountId: 'a1',
    })
    expect(result).toMatchObject({
      processed: 1,
      emailsSent: 1,
      emailsFailed: 0,
      contributionsCreated: 1,
      contributionsSkipped: 0,
    })
    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'goal_contribution_accept',
        idempotencyKey: `finance:goal_contribution:g1:${PERIOD}`,
      })
    )
    const payload = vi.mocked(sender.send).mock.calls[0][0]
    expect(payload.data).not.toHaveProperty('amount')
  })

  it('CA-WI2.6 un segundo barrido no crea otra fila ni reenvía el correo', async () => {
    repo.ensureGoalContribution.mockResolvedValue(false as never)
    repo.createNotifications.mockResolvedValue([] as never)
    repo.findPendingEmailKeys.mockResolvedValue(new Set() as never)
    const sender = senderStub()

    const result = await NotificationService.processAll(sender)

    expect(result).toMatchObject({
      contributionsCreated: 0,
      contributionsSkipped: 1,
      emailsSent: 0,
    })
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('CA-WI2.1 una meta con el toggle apagado no genera nada aunque tenga día', async () => {
    repo.findGoalsWithReminder.mockResolvedValue([scheduledGoal({ reminderEnabled: false })] as never)
    const sender = senderStub()

    const notifications = await NotificationService.collectNotifications('u1', rules, NOW)
    const result = await NotificationService.processAll(sender)

    expect(notifications).toHaveLength(0)
    expect(result).toMatchObject({ contributionsCreated: 0, emailsSent: 0 })
    expect(repo.ensureGoalContribution).not.toHaveBeenCalled()
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('CA-WI2.7 el switch global es maestro: apagado no hay campana ni correo aunque emailEnabled esté a true', async () => {
    repo.findRules.mockResolvedValue(ruleRows(false, true) as never)
    const globalOff = { ...rules, goalReminder: { enabled: false, emailEnabled: true } }
    const sender = senderStub()

    const notifications = await NotificationService.collectNotifications('u1', globalOff, NOW)
    const result = await NotificationService.processAll(sender)

    expect(notifications).toHaveLength(0)
    expect(result).toMatchObject({ contributionsCreated: 0, emailsSent: 0 })
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('CA-WI2.4 sin emailEnabled crea fila y aviso in-app pero no envía correo', async () => {
    repo.findRules.mockResolvedValue(ruleRows(true, false) as never)
    const sender = senderStub()

    const result = await NotificationService.processAll(sender)

    expect(result).toMatchObject({ contributionsCreated: 1, emailsSent: 0 })
    expect(repo.ensureGoalContribution).toHaveBeenCalled()
    expect(sender.send).not.toHaveBeenCalled()
  })

  it.each([
    ['sin cuenta de ahorro', { accountId: null }],
    ['con objetivo alcanzado', { saved: 1000 }],
    ['con día distinto', { reminderDay: 17 }],
  ])('CA-WI2.5 no genera aviso ni aportación para meta %s', async (_case, overrides) => {
    repo.findGoalsWithReminder.mockResolvedValue([scheduledGoal(overrides)] as never)
    const sender = senderStub()

    const notifications = await NotificationService.collectNotifications('u1', rules, NOW)
    const result = await NotificationService.processAll(sender)

    expect(notifications).toHaveLength(0)
    expect(result).toMatchObject({ contributionsCreated: 0, emailsSent: 0 })
    expect(repo.ensureGoalContribution).not.toHaveBeenCalled()
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('CA-WI2.5 una meta archivada no llega al barrido', async () => {
    repo.findGoalsWithReminder.mockResolvedValue([] as never)
    const sender = senderStub()

    const result = await NotificationService.processAll(sender)

    expect(result).toMatchObject({ contributionsCreated: 0, emailsSent: 0 })
    expect(repo.ensureGoalContribution).not.toHaveBeenCalled()
  })

  it('CA-WI2.6 reintentar tras un fallo del micro conserva la misma URL de aceptación', async () => {
    const first = await NotificationService.collectNotifications('u1', rules, NOW)
    repo.findPendingEmailKeys.mockResolvedValue(new Set([`goal_contribution:g1:${PERIOD}`]) as never)
    const second = await NotificationService.collectNotifications('u1', rules, NOW)

    expect(String(second[0].email?.data.acceptUrl)).toBe(String(first[0].email?.data.acceptUrl))
  })
})
