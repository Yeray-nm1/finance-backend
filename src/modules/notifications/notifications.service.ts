import { z } from 'zod'
import { BadRequestError, NotFoundError } from '../../core/errors'
import { nextChargeDate } from '../../utils/subscription-dates'
import { NotificationRepository, NewNotification } from './notifications.repository'
import {
  DAYS_BEFORE,
  DaysBefore,
  NotificationRules,
  NotificationsResponse,
  SummaryFrequency,
} from './notifications.types'

const saveRulesSchema = z.object({
  subscriptionDue: z.object({
    enabled: z.boolean(),
    daysBefore: z.union([z.literal(1), z.literal(3), z.literal(7)]),
  }),
  spendingSummary: z.object({
    enabled: z.boolean(),
    frequency: z.enum(['weekly', 'monthly']),
  }),
})

const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
const shortDate = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

function periodFor(frequency: SummaryFrequency, now: Date) {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const dayOfMonth = now.getUTCDate()

  if (frequency === 'monthly') {
    const start = new Date(Date.UTC(year, month, 1))
    const end = new Date(Date.UTC(year, month + 1, 1))
    return { start, end, label: 'este mes', key: start.toISOString().slice(0, 7) }
  }

  const weekday = (now.getUTCDay() + 6) % 7 // lunes = 0
  const start = new Date(Date.UTC(year, month, dayOfMonth - weekday))
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
  return { start, end, label: 'esta semana', key: start.toISOString().slice(0, 10) }
}

export const NotificationService = {
  async getRules(userId: string): Promise<NotificationRules> {
    const rules = await NotificationRepository.findRules(userId)
    const subscription = rules.find((rule) => rule.type === 'subscription_due')
    const summary = rules.find((rule) => rule.type === 'spending_summary')

    const daysBefore = subscription?.daysBefore
    const frequency = summary?.summaryFrequency

    return {
      subscriptionDue: {
        enabled: subscription?.enabled ?? false,
        daysBefore: DAYS_BEFORE.includes(daysBefore as DaysBefore)
          ? (daysBefore as DaysBefore)
          : 3,
      },
      spendingSummary: {
        enabled: summary?.enabled ?? false,
        frequency: frequency === 'weekly' || frequency === 'monthly' ? frequency : 'weekly',
      },
    }
  },

  async saveRules(userId: string, body: unknown): Promise<NotificationRules> {
    const parsed = saveRulesSchema.safeParse(body)
    if (!parsed.success) {
      throw new BadRequestError(
        'Reglas de notificación inválidas: usa enabled, daysBefore (1, 3 o 7) y frequency (weekly o monthly)'
      )
    }

    const { subscriptionDue, spendingSummary } = parsed.data
    await Promise.all([
      NotificationRepository.saveRule(userId, 'subscription_due', {
        enabled: subscriptionDue.enabled,
        daysBefore: subscriptionDue.daysBefore,
      }),
      NotificationRepository.saveRule(userId, 'spending_summary', {
        enabled: spendingSummary.enabled,
        summaryFrequency: spendingSummary.frequency,
      }),
    ])

    return NotificationService.getRules(userId)
  },

  async list(userId: string): Promise<NotificationsResponse> {
    const rules = await NotificationService.getRules(userId)
    const now = new Date()
    const notifications: NewNotification[] = []

    if (rules.subscriptionDue.enabled) {
      const subscriptions = await NotificationRepository.findActiveSubscriptions(userId)
      for (const subscription of subscriptions) {
        const lastCharge = await NotificationRepository.findLastCharge(
          userId,
          subscription.id,
          subscription.name
        )
        const due = nextChargeDate(lastCharge, subscription.frequency, now)
        if (!due) continue

        const daysUntil = Math.round(
          (due.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
            (24 * 60 * 60 * 1000)
        )
        if (daysUntil < 0 || daysUntil > rules.subscriptionDue.daysBefore) continue

        const dateLabel = shortDate.format(due)
        notifications.push({
          key: `subscription_due:${subscription.id}:${due.toISOString().slice(0, 10)}`,
          type: 'subscription_due',
          title: `Próximo cobro: ${subscription.name}`,
          body: `${money.format(subscription.amount)} el ${dateLabel}.`,
        })
      }
    }

    if (rules.spendingSummary.enabled) {
      const { start, end, label, key } = periodFor(rules.spendingSummary.frequency, now)
      const spending = await NotificationRepository.sumExpenses(userId, start, end)
      if (spending.count > 0) {
        notifications.push({
          key: `summary:${rules.spendingSummary.frequency}:${key}`,
          type: 'spending_summary',
          title: 'Resumen de gastos',
          body: `Has gastado ${money.format(spending.total)} ${label} en ${spending.count} ${spending.count === 1 ? 'movimiento' : 'movimientos'}.`,
        })
      }
    }

    await NotificationRepository.createNotifications(userId, notifications)

    const [items, unreadCount] = await Promise.all([
      NotificationRepository.list(userId),
      NotificationRepository.countUnread(userId),
    ])
    return { items, unreadCount }
  },

  async markRead(userId: string, id: string) {
    const updated = await NotificationRepository.markRead(userId, id)
    if (!updated) throw new NotFoundError('Notification')
  },

  markAllRead(userId: string) {
    return NotificationRepository.markAllRead(userId)
  },
}
