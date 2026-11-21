import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/modules/notifications/notifications.repository', () => ({
  NotificationRepository: {
    findRules: vi.fn(),
    saveRule: vi.fn(),
    findUsersWithNotifications: vi.fn(),
    findActiveSubscriptions: vi.fn(),
    findLastCharge: vi.fn(),
    sumExpenses: vi.fn(),
    summaryForPeriod: vi.fn(),
    monthlyBudgetTotal: vi.fn(),
    createNotifications: vi.fn(),
    findPendingEmailKeys: vi.fn(),
    markEmailsSent: vi.fn(),
    disableEmails: vi.fn(),
  },
}))

import { cronSecretMiddleware } from '../src/middlewares/cron-secret.middleware'
import { NotificationRepository } from '../src/modules/notifications/notifications.repository'
import { NotificationService } from '../src/modules/notifications/notifications.service'

const repo = vi.mocked(NotificationRepository)
const NOW = new Date('2026-11-17T12:00:00.000Z')

const rules = [
  {
    id: 'r1',
    userId: 'u1',
    type: 'subscription_due',
    enabled: true,
    emailEnabled: true,
    daysBefore: 3,
    summaryFrequency: 'weekly',
    createdAt: NOW,
  },
  {
    id: 'r2',
    userId: 'u1',
    type: 'spending_summary',
    enabled: true,
    emailEnabled: false,
    daysBefore: 3,
    summaryFrequency: 'weekly',
    createdAt: NOW,
  },
]

function senderStub() {
  return { send: vi.fn().mockResolvedValue(undefined) }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  repo.findRules.mockResolvedValue(rules as never)
  repo.findUsersWithNotifications.mockResolvedValue([{ id: 'u1', email: 'user@example.com' }] as never)
  repo.findActiveSubscriptions.mockResolvedValue([
    { id: 's1', name: 'Netflix', amount: 12.99, frequency: 'weekly', active: true },
  ] as never)
  repo.findLastCharge.mockResolvedValue(new Date('2026-11-10T00:00:00.000Z') as never)
  repo.sumExpenses.mockResolvedValue({ total: 42.5, count: 3 } as never)
  repo.summaryForPeriod.mockResolvedValue({
    spent: 42.5,
    count: 3,
    income: 0,
    categories: [],
  } as never)
  repo.monthlyBudgetTotal.mockResolvedValue(null as never)
  repo.createNotifications.mockImplementation(async (_userId, items) => items as never)
  repo.findPendingEmailKeys.mockResolvedValue(
    new Set(['subscription_due:s1:2026-11-17', 'summary:weekly:2026-11-16']) as never
  )
  repo.markEmailsSent.mockResolvedValue(undefined as never)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('WI-2 · reglas con emailEnabled', () => {
  it('persiste emailEnabled por regla al guardar', async () => {
    await NotificationService.saveRules('u1', {
      subscriptionDue: { enabled: true, daysBefore: 3, emailEnabled: true },
      spendingSummary: { enabled: true, frequency: 'weekly', emailEnabled: false },
    })

    expect(repo.saveRule).toHaveBeenCalledWith('u1', 'subscription_due', {
      enabled: true,
      daysBefore: 3,
      emailEnabled: true,
    })
    expect(repo.saveRule).toHaveBeenCalledWith('u1', 'spending_summary', {
      enabled: true,
      summaryFrequency: 'weekly',
      emailEnabled: false,
    })
  })

  it('devuelve emailEnabled en GET /rules', async () => {
    const result = await NotificationService.getRules('u1')

    expect(result.subscriptionDue.emailEnabled).toBe(true)
    expect(result.spendingSummary.emailEnabled).toBe(false)
  })
})

describe('WI-2 · endpoint interno /process', () => {
  it('genera avisos in-app de todos los usuarios y solo envía email de la regla con emailEnabled', async () => {
    const sender = senderStub()

    const result = await NotificationService.processAll(sender)

    expect(result).toMatchObject({ processed: 2, emailsSent: 1, emailsFailed: 0 })
    expect(repo.createNotifications).toHaveBeenCalledTimes(1)
    expect(sender.send).toHaveBeenCalledTimes(1)
    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        fromName: 'Finance Dashboard',
        template: 'subscription_due',
        idempotencyKey: 'finance:subscription_due:s1:2026-11-17',
      })
    )
    const payload = vi.mocked(sender.send).mock.calls[0][0]
    expect(payload.data).toMatchObject({ description: 'Netflix', amount: 12.99 })
    expect(String(payload.data.unsubscribeUrl)).toContain('/api/v1/unsubscribe?token=')
  })

  it('no llama al micro si ninguna regla tiene emailEnabled, pero crea los avisos in-app', async () => {
    repo.findRules.mockResolvedValue(rules.map((rule) => ({ ...rule, emailEnabled: false })) as never)
    const sender = senderStub()

    const result = await NotificationService.processAll(sender)

    expect(result.processed).toBe(2)
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('envía el correo pendiente aunque el aviso in-app ya existiera', async () => {
    repo.createNotifications.mockResolvedValue([] as never)
    const sender = senderStub()

    const result = await NotificationService.processAll(sender)

    expect(result).toMatchObject({ processed: 0, emailsSent: 1, emailsFailed: 0 })
    expect(sender.send).toHaveBeenCalledOnce()
    expect(repo.markEmailsSent).toHaveBeenCalledWith('u1', ['subscription_due:s1:2026-11-17'])
  })

  it('no pierde los avisos in-app si el micro falla', async () => {
    const sender = { send: vi.fn().mockRejectedValue(new Error('micro caído')) }

    const result = await NotificationService.processAll(sender)

    expect(result).toMatchObject({ processed: 2, emailsSent: 0, emailsFailed: 1 })
  })

  it('no reenvía el correo en el siguiente barrido tras marcarlo como enviado', async () => {
    const first = senderStub()
    const second = senderStub()

    await NotificationService.processAll(first)
    repo.findPendingEmailKeys.mockResolvedValue(new Set() as never)
    await NotificationService.processAll(second)

    expect(first.send).toHaveBeenCalledOnce()
    expect(second.send).not.toHaveBeenCalled()
    expect(repo.markEmailsSent).toHaveBeenCalledWith('u1', ['subscription_due:s1:2026-11-17'])
  })
})

describe('WI-2 · CRON_SECRET', () => {
  const next = vi.fn()

  beforeEach(() => next.mockReset())

  it('rechaza la petición sin el header', () => {
    expect(() => cronSecretMiddleware({ headers: {} } as never, {} as never, next)).toThrow(
      'Invalid or missing cron secret'
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('rechaza la petición con un secreto incorrecto', () => {
    expect(() =>
      cronSecretMiddleware({ headers: { 'x-cron-secret': 'mal' } } as never, {} as never, next)
    ).toThrow('Invalid or missing cron secret')
    expect(next).not.toHaveBeenCalled()
  })

  it('permite la petición con el secreto correcto', () => {
    cronSecretMiddleware(
      { headers: { 'x-cron-secret': 'test-cron-secret' } } as never,
      {} as never,
      next
    )

    expect(next).toHaveBeenCalledOnce()
  })
})
