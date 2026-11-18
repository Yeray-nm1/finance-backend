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
    contributionScheduled: true,
    ...overrides,
  }
}

function senderStub() {
  return { send: vi.fn().mockResolvedValue(undefined) }
}

function ruleRows(emailEnabled: boolean) {
  return [
    { id: 'r1', userId: 'u1', type: 'goal_reminder', enabled: true, emailEnabled },
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

describe('aportación programada · generación en el barrido', () => {
  it('CA-3.1 genera un aviso y un correo de aceptación en lugar del recordatorio manual', async () => {
    const notifications = await NotificationService.collectNotifications('u1', rules, NOW)

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      key: `goal_contribution:g1:${PERIOD}`,
      type: 'goal_contribution',
      title: 'Aportación programada: Viaje a Japón',
    })
    expect(notifications[0].body).toContain('100,00')
    expect(notifications[0].email).toMatchObject({
      template: 'goal_contribution_accept',
      data: {
        goalName: 'Viaje a Japón',
        amount: 100,
        period: PERIOD,
      },
    })
    expect(String(notifications[0].email?.data.acceptUrl)).toMatch(/\/goals\/aceptar\?token=/)
    expect(String(notifications[0].email?.data.unsubscribeUrl)).toContain('/api/v1/unsubscribe?token=')
    expect(notifications.some((item) => item.type === 'goal_reminder')).toBe(false)
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

  it('CA-3.1 el barrido congela importe y destino y devuelve los contadores', async () => {
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
  })

  it('CA-3.2 un segundo barrido no crea otra fila ni reenvía el correo', async () => {
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

  it('CA-3.3 las metas sin programar conservan el goal_reminder actual', async () => {
    repo.findGoalsWithReminder.mockResolvedValue([
      scheduledGoal({ contributionScheduled: false }),
    ] as never)
    repo.findPendingEmailKeys.mockResolvedValue(new Set([`goal_reminder:g1:${PERIOD}`]) as never)

    const notifications = await NotificationService.collectNotifications('u1', rules, NOW)
    const sender = senderStub()
    await NotificationService.processAll(sender)

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      key: `goal_reminder:g1:${PERIOD}`,
      type: 'goal_reminder',
    })
    expect(repo.ensureGoalContribution).not.toHaveBeenCalled()
    expect(sender.send).toHaveBeenCalledWith(expect.objectContaining({ template: 'goal_reminder' }))
  })

  it('CA-3.4 sin emailEnabled crea fila y aviso in-app pero no envía correo', async () => {
    repo.findRules.mockResolvedValue(ruleRows(false) as never)
    const sender = senderStub()

    const result = await NotificationService.processAll(sender)

    expect(result).toMatchObject({ contributionsCreated: 1, emailsSent: 0 })
    expect(repo.ensureGoalContribution).toHaveBeenCalled()
    expect(sender.send).not.toHaveBeenCalled()
  })

  it.each([
    ['sin cuenta de ahorro', { accountId: null }],
    ['con objetivo alcanzado', { saved: 1000 }],
  ])('CA-3.5 no genera aportación ni correo para meta %s', async (_case, overrides) => {
    repo.findGoalsWithReminder.mockResolvedValue([scheduledGoal(overrides)] as never)
    const sender = senderStub()

    const result = await NotificationService.processAll(sender)

    expect(result).toMatchObject({ contributionsCreated: 0, emailsSent: 0 })
    expect(repo.ensureGoalContribution).not.toHaveBeenCalled()
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('CA-3.5 una meta archivada no llega al barrido', async () => {
    repo.findGoalsWithReminder.mockResolvedValue([] as never)
    const sender = senderStub()

    const result = await NotificationService.processAll(sender)

    expect(result).toMatchObject({ contributionsCreated: 0, emailsSent: 0 })
    expect(repo.ensureGoalContribution).not.toHaveBeenCalled()
  })

  it('CA-3.6 reintentar tras un fallo del micro conserva la misma URL de aceptación', async () => {
    const first = await NotificationService.collectNotifications('u1', rules, NOW)
    repo.findPendingEmailKeys.mockResolvedValue(new Set([`goal_contribution:g1:${PERIOD}`]) as never)
    const second = await NotificationService.collectNotifications('u1', rules, NOW)

    expect(String(second[0].email?.data.acceptUrl)).toBe(String(first[0].email?.data.acceptUrl))
  })
})
