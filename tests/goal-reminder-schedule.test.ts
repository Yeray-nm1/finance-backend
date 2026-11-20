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

import { config } from '../src/config/env'
import { NotificationRepository } from '../src/modules/notifications/notifications.repository'
import { NotificationService } from '../src/modules/notifications/notifications.service'
import { verifyGoalContributionToken } from '../src/utils/goal-contribution-token'

const repo = vi.mocked(NotificationRepository)
const RECIPIENT = 'Ana'

const rules = {
  subscriptionDue: { enabled: false, emailEnabled: false, daysBefore: 3 as const },
  spendingSummary: { enabled: false, emailEnabled: false, frequency: 'weekly' as const },
  goalReminder: { enabled: true, emailEnabled: true },
}

function goal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    name: 'Viaje a Japón',
    targetAmount: 1000,
    reminderFrequency: 'MONTHLY',
    reminderChannel: 'APP_AND_EMAIL',
    reminderWeekday: null,
    reminderDay: 18,
    reminderLastDay: false,
    reminderInterval: null,
    reminderIntervalUnit: null,
    reminderStartDate: null,
    reminderAmount: 100,
    saved: 250,
    accountId: 'a1',
    reminderEnabled: true,
    ...overrides,
  }
}

function ruleRows(enabled = true, emailEnabled = true) {
  return [{ id: 'r1', userId: 'u1', type: 'goal_reminder', enabled, emailEnabled }]
}

function senderStub() {
  return { send: vi.fn().mockResolvedValue(undefined) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-18T12:00:00.000Z'))
  repo.findRules.mockResolvedValue(ruleRows() as never)
  repo.findUsersWithNotifications.mockResolvedValue([
    { id: 'u1', email: 'user@example.com', name: 'Ana' },
  ] as never)
  repo.findGoalsWithReminder.mockResolvedValue([goal()] as never)
  repo.createNotifications.mockImplementation(async (_userId, items) => items as never)
  repo.findPendingEmailKeys.mockResolvedValue(
    new Set(['goal_contribution:g1:M:2026-11']) as never
  )
  repo.markEmailsSent.mockResolvedValue(undefined as never)
  repo.ensureGoalContribution.mockResolvedValue(true as never)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('payload del correo de meta', () => {
  it('CA-4/CA-6 entrega nombre, progreso, importe opcional y enlaces, sin periodo', async () => {
    const now = new Date('2026-11-18T12:00:00.000Z')
    const notifications = await NotificationService.collectNotifications('u1', rules, now, RECIPIENT)

    expect(notifications).toHaveLength(1)
    expect(notifications[0].email?.data).toMatchObject({
      recipientName: 'Ana',
      goalName: 'Viaje a Japón',
      saved: 250,
      targetAmount: 1000,
      suggestedAmount: 100,
    })
    expect(notifications[0].email?.data).not.toHaveProperty('period')
    // El micro valida manageUrl con z.string().url(): debe ser absoluta.
    const manageUrl = String(notifications[0].email?.data.manageUrl)
    expect(manageUrl).toBe(`${config.frontendUrl.replace(/\/$/, '')}/preferences`)
    expect(() => new URL(manageUrl)).not.toThrow()
    expect(notifications[0].email?.template).toBe('goal_contribution_accept')
  })

  it('CA-7 suggestedAmount nullable cuando la meta no tiene importe', async () => {
    repo.findGoalsWithReminder.mockResolvedValue([goal({ reminderAmount: null })] as never)

    const notifications = await NotificationService.collectNotifications(
      'u1',
      rules,
      new Date('2026-11-18T12:00:00.000Z'),
      RECIPIENT
    )

    expect(notifications[0].email?.data.suggestedAmount).toBeNull()
  })

  it('CA-12 APP_ONLY crea la campana pero no adjunta correo', async () => {
    repo.findGoalsWithReminder.mockResolvedValue([goal({ reminderChannel: 'APP_ONLY' })] as never)

    const notifications = await NotificationService.collectNotifications(
      'u1',
      rules,
      new Date('2026-11-18T12:00:00.000Z'),
      RECIPIENT
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0].type).toBe('goal_contribution')
    expect(notifications[0].email).toBeUndefined()
  })

  it('CA-12 APP_AND_EMAIL con emailEnabled a false sigue sin enviar correo', async () => {
    repo.findRules.mockResolvedValue(ruleRows(true, false) as never)
    const sender = senderStub()

    const result = await NotificationService.processAll(sender)

    expect(result).toMatchObject({ emailsSent: 0, contributionsCreated: 1 })
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('CA-4 processAll resuelve el nombre del usuario y lo envía al micro', async () => {
    const sender = senderStub()

    await NotificationService.processAll(sender)

    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recipientName: 'Ana' }),
      })
    )
  })
})

describe('frecuencias por meta', () => {
  it('CA-14 semanal usa el prefijo W: y la fecha de la ocurrencia', async () => {
    const now = new Date('2026-11-20T12:00:00.000Z') // viernes
    repo.findGoalsWithReminder.mockResolvedValue([
      goal({ reminderFrequency: 'WEEKLY', reminderWeekday: 5, reminderDay: null }),
    ] as never)

    const notifications = await NotificationService.collectNotifications('u1', rules, now, RECIPIENT)

    expect(notifications[0].key).toBe('goal_contribution:g1:W:2026-11-20')
    const acceptUrl = new URL(String(notifications[0].email?.data.acceptUrl))
    expect(verifyGoalContributionToken(acceptUrl.searchParams.get('token') ?? '')).toMatchObject({
      goalId: 'g1',
      period: 'W:2026-11-20',
    })
  })

  it('CA-11 mensual con último día solo genera aviso el último día', async () => {
    repo.findGoalsWithReminder.mockResolvedValue([
      goal({ reminderDay: null, reminderLastDay: true }),
    ] as never)

    const onLastDay = await NotificationService.collectNotifications(
      'u1',
      rules,
      new Date('2026-11-30T12:00:00.000Z'),
      RECIPIENT
    )
    const beforeLastDay = await NotificationService.collectNotifications(
      'u1',
      rules,
      new Date('2026-11-29T12:00:00.000Z'),
      RECIPIENT
    )

    expect(onLastDay[0].key).toBe('goal_contribution:g1:M:2026-11')
    expect(beforeLastDay).toHaveLength(0)
  })

  it('CA-11 personalizada usa el prefijo C: en la fecha de la ocurrencia', async () => {
    const now = new Date('2026-11-25T12:00:00.000Z')
    repo.findGoalsWithReminder.mockResolvedValue([
      goal({
        reminderFrequency: 'CUSTOM',
        reminderDay: null,
        reminderInterval: 2,
        reminderIntervalUnit: 'DAYS',
        reminderStartDate: new Date('2026-11-23T00:00:00.000Z'),
      }),
    ] as never)

    const notifications = await NotificationService.collectNotifications('u1', rules, now, RECIPIENT)

    expect(notifications[0].key).toBe('goal_contribution:g1:C:2026-11-25')
  })

  it('CA-14 ensureScheduledContributions guarda el periodo con prefijo', async () => {
    await NotificationService.ensureScheduledContributions('u1', new Date('2026-11-18T12:00:00.000Z'))

    expect(repo.ensureGoalContribution).toHaveBeenCalledWith({
      userId: 'u1',
      goalId: 'g1',
      period: 'M:2026-11',
      amount: 100,
      goalAccountId: 'a1',
    })
  })
})
