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

import { config } from '../src/config/env'
import { NotificationRepository } from '../src/modules/notifications/notifications.repository'
import { NotificationService } from '../src/modules/notifications/notifications.service'

const repo = vi.mocked(NotificationRepository)
const NOW = new Date('2026-11-17T12:00:00.000Z')
const base = config.frontendUrl.replace(/\/$/, '')

const rules = [
  {
    id: 'r1',
    userId: 'u1',
    type: 'spending_summary',
    enabled: true,
    emailEnabled: true,
    daysBefore: 3,
    summaryFrequency: 'weekly',
    createdAt: NOW,
  },
]

const current = {
  spent: 842.35,
  count: 9,
  income: 1850,
  categories: [
    { name: 'Comida', amount: 312.4 },
    { name: 'Ocio', amount: 130.2 },
    { name: 'Sin categoría', amount: 208.3 },
  ],
}
const previous = { spent: 752.1, count: 7, income: 1761.9, categories: [] }

function senderStub() {
  return { send: vi.fn().mockResolvedValue(undefined) }
}

async function payloadFor(frequency: 'weekly' | 'monthly' = 'weekly') {
  repo.findRules.mockResolvedValue(
    rules.map((rule) => ({ ...rule, summaryFrequency: frequency })) as never,
  )
  const sender = senderStub()
  await NotificationService.processAll(sender)
  const call = vi
    .mocked(sender.send)
    .mock.calls.find(([message]) => message.template === 'spending_summary')
  return call?.[0].data
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  repo.findRules.mockResolvedValue(rules as never)
  repo.findUsersWithNotifications.mockResolvedValue([
    { id: 'u1', name: 'Ana', email: 'ana@example.com' },
  ] as never)
  repo.findActiveSubscriptions.mockResolvedValue([] as never)
  repo.summaryForPeriod.mockImplementation(async (_userId, start) =>
    (start.getUTCDate() === 16 && start.getUTCMonth() === 10 ? current : previous) as never,
  )
  repo.monthlyBudgetTotal.mockResolvedValue(1200 as never)
  repo.createNotifications.mockImplementation(async (_userId, items) => items as never)
  repo.findPendingEmailKeys.mockResolvedValue(
    new Set(['summary:weekly:2026-11-16', 'summary:monthly:2026-11']) as never
  )
  repo.markEmailsSent.mockResolvedValue(undefined as never)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('resumen de gastos · payload del email', () => {
  it('envía todos los datos que pide el diseño aprobado', async () => {
    const data = await payloadFor()

    expect(data).toMatchObject({
      recipientName: 'Ana',
      period: '16–22 de noviembre',
      frequency: 'weekly',
      budgetMonth: 'noviembre',
      total: 842.35,
      income: 1850,
      categories: current.categories,
      budget: 1200,
      dashboardUrl: `${base}/`,
      manageUrl: `${base}/preferences`,
    })
    expect(String(data?.unsubscribeUrl)).toContain('/api/v1/unsubscribe?token=')
  })

  it('calcula las variaciones contra el periodo anterior', async () => {
    const data = await payloadFor()

    expect(data?.spentTrend).toBe(12)
    expect(data?.incomeTrend).toBe(5)
  })

  it('consulta el periodo anterior con la misma longitud', async () => {
    await payloadFor()

    const starts = repo.summaryForPeriod.mock.calls.map(([, start]) => start.toISOString())
    expect(starts).toContain('2026-11-16T00:00:00.000Z')
    expect(starts).toContain('2026-11-09T00:00:00.000Z')
  })

  it('deja la variación a null si el periodo anterior no tiene datos', async () => {
    repo.summaryForPeriod.mockResolvedValue({ ...previous, spent: 0, income: 0 } as never)

    const data = await payloadFor()

    expect(data?.spentTrend).toBeNull()
    expect(data?.incomeTrend).toBeNull()
  })

  it('adapta el periodo y la frecuencia a resumen mensual', async () => {
    repo.summaryForPeriod.mockResolvedValue(current as never)

    const data = await payloadFor('monthly')

    expect(data).toMatchObject({
      period: 'noviembre de 2026',
      frequency: 'monthly',
      budgetMonth: 'noviembre',
    })
  })

  it('no envía correo si no hubo gastos en el periodo', async () => {
    repo.summaryForPeriod.mockResolvedValue({ ...current, spent: 0, count: 0 } as never)
    const sender = senderStub()

    await NotificationService.processAll(sender)

    expect(sender.send).not.toHaveBeenCalled()
  })
})
