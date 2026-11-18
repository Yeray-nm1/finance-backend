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
  },
}))

import { NotificationRepository } from '../src/modules/notifications/notifications.repository'
import { NotificationService } from '../src/modules/notifications/notifications.service'

const repo = vi.mocked(NotificationRepository)
const NOW = new Date('2026-11-18T12:00:00.000Z')

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
    },
    {
      id: 'g2',
      name: 'Fondo de emergencia',
      targetAmount: 5000,
      reminderDay: 5,
      reminderAmount: null,
      saved: 1200,
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
  repo.findGoalsWithReminder.mockResolvedValue(goalsWithReminder() as never)
  repo.createNotifications.mockImplementation(async (_userId, items) => items as never)
  repo.findPendingEmailKeys.mockResolvedValue(new Set(['goal_reminder:g1:2026-11']) as never)
  repo.markEmailsSent.mockResolvedValue(undefined as never)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('recordatorio mensual de metas · reglas', () => {
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

describe('recordatorio mensual de metas · avisos', () => {
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
      key: 'goal_reminder:g1:2026-11',
      type: 'goal_reminder',
      title: 'Recordatorio de meta: Viaje a Japón',
    })
    expect(notifications[0].body).toContain('100,00')
    expect(notifications[0].email).toMatchObject({
      template: 'goal_reminder',
      data: {
        goalName: 'Viaje a Japón',
        saved: 250,
        target: 1000,
        suggestedAmount: 100,
      },
    })
    expect(String(notifications[0].email?.data.goalsUrl)).toMatch(/\/goals$/)
    expect(String(notifications[0].email?.data.unsubscribeUrl)).toContain('/api/v1/unsubscribe?token=')
  })

  it('no genera avisos si la regla está desactivada', async () => {
    const notifications = await NotificationService.collectNotifications(
      'u1',
      { ...enabledRules, goalReminder: { enabled: false, emailEnabled: true } },
      NOW
    )

    expect(notifications).toEqual([])
    expect(repo.findGoalsWithReminder).not.toHaveBeenCalled()
  })

  it('omite suggestedAmount cuando la meta no tiene importe sugerido', async () => {
    repo.findGoalsWithReminder.mockResolvedValue([
      { ...goalsWithReminder()[1], reminderDay: 18 },
    ] as never)

    const notifications = await NotificationService.collectNotifications('u1', enabledRules, NOW)

    expect(notifications).toHaveLength(1)
    expect(notifications[0].email?.data).not.toHaveProperty('suggestedAmount')
  })

  it('envía el correo solo si goalReminder.emailEnabled', async () => {
    repo.findRules.mockResolvedValue([...baseRules, goalReminderRule(true, true)] as never)
    repo.findUsersWithNotifications.mockResolvedValue([{ id: 'u1', email: 'user@example.com' }] as never)
    const sender = senderStub()

    const result = await NotificationService.processAll(sender)

    expect(result).toMatchObject({ processed: 1, emailsSent: 1, emailsFailed: 0 })
    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        fromName: 'Finance Dashboard',
        template: 'goal_reminder',
        idempotencyKey: 'finance:goal_reminder:g1:2026-11',
      })
    )
  })

  it('crea el aviso in-app sin enviar correo si emailEnabled está a false', async () => {
    repo.findRules.mockResolvedValue([...baseRules, goalReminderRule(true, false)] as never)
    repo.findUsersWithNotifications.mockResolvedValue([{ id: 'u1', email: 'user@example.com' }] as never)
    const sender = senderStub()

    const result = await NotificationService.processAll(sender)

    expect(result).toMatchObject({ processed: 1, emailsSent: 0, emailsFailed: 0 })
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('no reenvía el recordatorio mensual tras marcarlo como enviado', async () => {
    repo.findRules.mockResolvedValue([...baseRules, goalReminderRule(true, true)] as never)
    repo.findUsersWithNotifications.mockResolvedValue([{ id: 'u1', email: 'user@example.com' }] as never)
    const first = senderStub()
    const second = senderStub()

    await NotificationService.processAll(first)
    repo.findPendingEmailKeys.mockResolvedValue(new Set() as never)
    await NotificationService.processAll(second)

    expect(first.send).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'finance:goal_reminder:g1:2026-11' })
    )
    expect(second.send).not.toHaveBeenCalled()
  })
})
