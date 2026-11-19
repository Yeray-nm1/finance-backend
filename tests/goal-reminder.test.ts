import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/modules/notifications/notifications.repository', () => ({
  NotificationRepository: {
    findRules: vi.fn(),
    saveRule: vi.fn(),
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

const baseRules = [
  {
    id: 'r1',
    userId: 'u1',
    type: 'subscription_due',
    enabled: false,
    emailEnabled: false,
    daysBefore: 3,
    summaryFrequency: 'weekly',
    createdAt: NOW,
  },
  {
    id: 'r2',
    userId: 'u1',
    type: 'spending_summary',
    enabled: false,
    emailEnabled: false,
    daysBefore: 3,
    summaryFrequency: 'weekly',
    createdAt: NOW,
  },
]

function goalReminderRule(enabled: boolean, emailEnabled: boolean) {
  return {
    id: 'r3',
    userId: 'u1',
    type: 'goal_reminder',
    enabled,
    emailEnabled,
    daysBefore: 3,
    summaryFrequency: 'weekly',
    createdAt: NOW,
  }
}

function goalsWithReminder() {
  return [
    {
      id: 'g1',
      name: 'Viaje a Japón',
      targetAmount: 1000,
      reminderDay: 18,
      reminderAmount: 100,
      saved: 250,
      accountId: 'a1',
      reminderEnabled: true,
    },
    {
      id: 'g2',
      name: 'Fondo de emergencia',
      targetAmount: 5000,
      reminderDay: 5,
      reminderAmount: null,
      saved: 1200,
      accountId: 'a2',
      reminderEnabled: true,
    },
  ]
}

function senderStub() {
  return { send: vi.fn().mockResolvedValue(undefined) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  repo.findRules.mockResolvedValue(baseRules as never)
  repo.findUsersWithNotifications.mockResolvedValue([{ id: 'u1', email: 'user@example.com' }] as never)
  repo.findGoalsWithReminder.mockResolvedValue(goalsWithReminder() as never)
  repo.createNotifications.mockImplementation(async (_userId, items) => items as never)
  repo.findPendingEmailKeys.mockResolvedValue(new Set([`goal_contribution:g1:${PERIOD}`]) as never)
  repo.markEmailsSent.mockResolvedValue(undefined as never)
  repo.ensureGoalContribution.mockResolvedValue(true as never)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('avisos de metas · reglas globales', () => {
  it('devuelve goalReminder en GET /rules', async () => {
    repo.findRules.mockResolvedValue([...baseRules, goalReminderRule(true, true)] as never)

    const rules = await NotificationService.getRules('u1')

    expect(rules.goalReminder).toEqual({ enabled: true, emailEnabled: true })
  })

  it('goalReminder viene desactivado si no hay regla guardada', async () => {
    const rules = await NotificationService.getRules('u1')

    expect(rules.goalReminder).toEqual({ enabled: false, emailEnabled: false })
  })

  it('persiste la regla goal_reminder al guardar', async () => {
    repo.findRules.mockResolvedValue([...baseRules, goalReminderRule(true, true)] as never)

    await NotificationService.saveRules('u1', {
      subscriptionDue: { enabled: false, daysBefore: 3, emailEnabled: false },
      spendingSummary: { enabled: false, frequency: 'weekly', emailEnabled: false },
      goalReminder: { enabled: true, emailEnabled: true },
    })

    expect(repo.saveRule).toHaveBeenCalledWith('u1', 'goal_reminder', {
      enabled: true,
      emailEnabled: true,
    })
  })

  it('acepta payloads antiguos sin goalReminder', async () => {
    await expect(
      NotificationService.saveRules('u1', {
        subscriptionDue: { enabled: false, daysBefore: 3, emailEnabled: false },
        spendingSummary: { enabled: false, frequency: 'weekly', emailEnabled: false },
      })
    ).resolves.toBeDefined()
  })
})

describe('avisos de metas unificados', () => {
  const enabledRules = {
    subscriptionDue: { enabled: false, emailEnabled: false, daysBefore: 3 as const },
    spendingSummary: { enabled: false, emailEnabled: false, frequency: 'weekly' as const },
    goalReminder: { enabled: true, emailEnabled: false },
  }

  it('genera el aviso in-app solo para las metas cuyo día coincide con hoy', async () => {
    const notifications = await NotificationService.collectNotifications('u1', enabledRules, NOW)

    expect(repo.findGoalsWithReminder).toHaveBeenCalledWith('u1')
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      key: `goal_contribution:g1:${PERIOD}`,
      type: 'goal_contribution',
      title: 'Recordatorio de meta: Viaje a Japón',
      body: 'Tienes una aportación pendiente. Confírmala desde aquí.',
      email: {
        template: 'goal_contribution_accept',
        data: { goalName: 'Viaje a Japón', period: PERIOD },
      },
    })
    expect(notifications[0].body).not.toContain('100,00')
    expect(notifications[0].email?.data).not.toHaveProperty('amount')
    expect(String(notifications[0].email?.data.acceptUrl)).toMatch(/\/goals\/aceptar\?token=/)
    expect(String(notifications[0].email?.data.unsubscribeUrl)).toContain('/api/v1/unsubscribe?token=')
    expect(notifications.some((item) => item.type === 'goal_reminder')).toBe(false)
  })

  it('no genera avisos si la regla global está desactivada', async () => {
    const notifications = await NotificationService.collectNotifications(
      'u1',
      { ...enabledRules, goalReminder: { enabled: false, emailEnabled: true } },
      NOW
    )

    expect(notifications).toEqual([])
    expect(repo.findGoalsWithReminder).not.toHaveBeenCalled()
  })

  it('el correo sigue sin importe aunque la meta tenga sugerencia', async () => {
    const notifications = await NotificationService.collectNotifications('u1', enabledRules, NOW)

    expect(notifications[0].email?.data).not.toHaveProperty('suggestedAmount')
    expect(notifications[0].email?.data).not.toHaveProperty('saved')
    expect(notifications[0].email?.data).not.toHaveProperty('target')
  })

  it('envía el correo solo si goalReminder.emailEnabled', async () => {
    repo.findRules.mockResolvedValue([...baseRules, goalReminderRule(true, true)] as never)
    const sender = senderStub()

    const result = await NotificationService.processAll(sender)

    expect(result).toMatchObject({ processed: 1, emailsSent: 1, emailsFailed: 0 })
    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        fromName: 'Finance Dashboard',
        template: 'goal_contribution_accept',
        idempotencyKey: `finance:goal_contribution:g1:${PERIOD}`,
      })
    )
    const payload = vi.mocked(sender.send).mock.calls[0][0]
    expect(payload.data).not.toHaveProperty('amount')
  })

  it('crea el aviso in-app sin enviar correo si emailEnabled está a false', async () => {
    repo.findRules.mockResolvedValue([...baseRules, goalReminderRule(true, false)] as never)
    const sender = senderStub()

    const result = await NotificationService.processAll(sender)

    expect(result).toMatchObject({ processed: 1, emailsSent: 0, emailsFailed: 0 })
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('no reenvía el aviso tras marcarlo como enviado', async () => {
    repo.findRules.mockResolvedValue([...baseRules, goalReminderRule(true, true)] as never)
    const first = senderStub()
    const second = senderStub()

    await NotificationService.processAll(first)
    repo.findPendingEmailKeys.mockResolvedValue(new Set() as never)
    await NotificationService.processAll(second)

    expect(first.send).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `finance:goal_contribution:g1:${PERIOD}` })
    )
    expect(second.send).not.toHaveBeenCalled()
  })
})
