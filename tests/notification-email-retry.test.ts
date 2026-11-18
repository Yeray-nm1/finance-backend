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
const NOW = new Date('2026-11-17T12:00:00.000Z')
const KEY = 'subscription_due:s1:2026-11-17'

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
    enabled: false,
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
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  repo.findRules.mockResolvedValue(rules as never)
  repo.findUsersWithNotifications.mockResolvedValue([{ id: 'u1', email: 'user@example.com' }] as never)
  repo.findActiveSubscriptions.mockResolvedValue([
    { id: 's1', name: 'Netflix', amount: 12.99, frequency: 'weekly', active: true },
  ] as never)
  repo.findLastCharge.mockResolvedValue(new Date('2026-11-10T00:00:00.000Z') as never)
  repo.sumExpenses.mockResolvedValue({ total: 0, count: 0 } as never)
  repo.findGoalsWithReminder.mockResolvedValue([] as never)
  repo.createNotifications.mockImplementation(async (_userId, items) => items as never)
  repo.findPendingEmailKeys.mockResolvedValue(new Set([KEY]) as never)
  repo.markEmailsSent.mockResolvedValue(undefined as never)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('envío de correo independiente de la creación del aviso in-app', () => {
  it('envía el correo aunque el aviso ya existiera porque el usuario abrió /notifications', async () => {
    repo.createNotifications.mockResolvedValue([] as never)
    const sender = senderStub()

    const result = await NotificationService.processAll(sender)

    expect(result).toMatchObject({ processed: 0, emailsSent: 1, emailsFailed: 0 })
    expect(sender.send).toHaveBeenCalledOnce()
    expect(repo.markEmailsSent).toHaveBeenCalledWith('u1', [KEY])
  })

  it('no reenvía el correo cuando ya está marcado como enviado', async () => {
    const first = senderStub()
    const second = senderStub()

    await NotificationService.processAll(first)
    repo.findPendingEmailKeys.mockResolvedValue(new Set() as never)
    const result = await NotificationService.processAll(second)

    expect(second.send).not.toHaveBeenCalled()
    expect(result.emailsSent).toBe(0)
  })

  it('conserva el correo pendiente si el micro falla y lo reintenta en el siguiente barrido', async () => {
    const failing = { send: vi.fn().mockRejectedValue(new Error('micro caído')) }

    const first = await NotificationService.processAll(failing)
    expect(first).toMatchObject({ processed: 1, emailsSent: 0, emailsFailed: 1 })
    expect(repo.markEmailsSent).not.toHaveBeenCalled()

    const retry = senderStub()
    const second = await NotificationService.processAll(retry)

    expect(second).toMatchObject({ processed: 1, emailsSent: 1, emailsFailed: 0 })
    expect(retry.send).toHaveBeenCalledOnce()
    expect(repo.markEmailsSent).toHaveBeenCalledWith('u1', [KEY])
  })

  it('no consulta pendientes ni envía cuando la regla tiene emailEnabled a false', async () => {
    repo.findRules.mockResolvedValue(rules.map((rule) => ({ ...rule, emailEnabled: false })) as never)
    const sender = senderStub()

    const result = await NotificationService.processAll(sender)

    expect(result.emailsSent).toBe(0)
    expect(repo.findPendingEmailKeys).not.toHaveBeenCalled()
    expect(repo.markEmailsSent).not.toHaveBeenCalled()
  })
})
