import { z } from 'zod'
import { BadRequestError, NotFoundError } from '../../core/errors'
import { logger } from '../../core/logger'
import { nextChargeDate } from '../../utils/subscription-dates'
import { createUnsubscribeUrl } from '../../utils/unsubscribe'
import { NotificationRepository, NewNotification } from './notifications.repository'
import { FINANCE_FROM_NAME, notificationSender, NotificationSender } from './notification-sender'
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
    emailEnabled: z.boolean().default(false),
    daysBefore: z.union([z.literal(1), z.literal(3), z.literal(7)]),
  }),
  spendingSummary: z.object({
    enabled: z.boolean(),
    emailEnabled: z.boolean().default(false),
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

export interface ProcessResult {
  processed: number
  emailsSent: number
  emailsFailed: number
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
        emailEnabled: subscription?.emailEnabled ?? false,
        daysBefore: DAYS_BEFORE.includes(daysBefore as DaysBefore)
          ? (daysBefore as DaysBefore)
          : 3,
      },
      spendingSummary: {
        enabled: summary?.enabled ?? false,
        emailEnabled: summary?.emailEnabled ?? false,
        frequency: frequency === 'weekly' || frequency === 'monthly' ? frequency : 'weekly',
      },
    }
  },

  async saveRules(userId: string, body: unknown): Promise<NotificationRules> {
    const parsed = saveRulesSchema.safeParse(body)
    if (!parsed.success) {
      throw new BadRequestError(
        'Reglas de notificación inválidas: usa enabled, emailEnabled, daysBefore (1, 3 o 7) y frequency (weekly o monthly)'
      )
    }

    const { subscriptionDue, spendingSummary } = parsed.data
    await Promise.all([
      NotificationRepository.saveRule(userId, 'subscription_due', {
        enabled: subscriptionDue.enabled,
        emailEnabled: subscriptionDue.emailEnabled,
        daysBefore: subscriptionDue.daysBefore,
      }),
      NotificationRepository.saveRule(userId, 'spending_summary', {
        enabled: spendingSummary.enabled,
        emailEnabled: spendingSummary.emailEnabled,
        summaryFrequency: spendingSummary.frequency,
      }),
    ])

    return NotificationService.getRules(userId)
  },

  /** Genera los avisos de un usuario sin persistirlos ni enviar correos. */
  async collectNotifications(
    userId: string,
    rules: NotificationRules,
    now: Date
  ): Promise<NewNotification[]> {
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
          (due.getTime() - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) /
            (24 * 60 * 60 * 1000)
        )
        if (daysUntil < 0 || daysUntil > rules.subscriptionDue.daysBefore) continue

        const dateLabel = shortDate.format(due)
        notifications.push({
          key: `subscription_due:${subscription.id}:${due.toISOString().slice(0, 10)}`,
          type: 'subscription_due',
          title: `Próximo cobro: ${subscription.name}`,
          body: `${money.format(subscription.amount)} el ${dateLabel}.`,
          email: {
            template: 'subscription_due',
            data: {
              description: subscription.name,
              amount: subscription.amount,
              chargeDate: dateLabel,
              unsubscribeUrl: createUnsubscribeUrl(userId),
            },
          },
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
          email: {
            template: 'spending_summary',
            data: {
              period: label,
              total: spending.total,
              unsubscribeUrl: createUnsubscribeUrl(userId),
            },
          },
        })
      }
    }

    return notifications
  },

  async list(userId: string): Promise<NotificationsResponse> {
    const rules = await NotificationService.getRules(userId)
    const notifications = await NotificationService.collectNotifications(userId, rules, new Date())
    await NotificationRepository.createNotifications(userId, notifications)

    const [items, unreadCount] = await Promise.all([
      NotificationRepository.list(userId),
      NotificationRepository.countUnread(userId),
    ])
    return { items, unreadCount }
  },

  /** Barrido del job: crea avisos in-app y envía por email solo las reglas con emailEnabled. */
  async processAll(
    sender: NotificationSender = notificationSender
  ): Promise<ProcessResult> {
    const users = await NotificationRepository.findUsersWithNotifications()
    const now = new Date()
    const result: ProcessResult = { processed: 0, emailsSent: 0, emailsFailed: 0 }

    for (const user of users) {
      const rules = await NotificationService.getRules(user.id)
      const notifications = await NotificationService.collectNotifications(user.id, rules, now)
      const created = await NotificationRepository.createNotifications(user.id, notifications)
      result.processed += created.length

      for (const notification of created) {
        const onlyIfEnabled =
          notification.type === 'subscription_due'
            ? rules.subscriptionDue.emailEnabled
            : rules.spendingSummary.emailEnabled

        if (!onlyIfEnabled || !notification.email) continue

        try {
          await sender.send({
            to: user.email,
            fromName: FINANCE_FROM_NAME,
            template: notification.email.template,
            data: notification.email.data,
            idempotencyKey: `finance:${notification.key}`,
          })
          result.emailsSent += 1
        } catch (error) {
          result.emailsFailed += 1
          logger.error('No se pudo enviar el aviso por email', {
            userId: user.id,
            key: notification.key,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    return result
  },

  async unsubscribe(userId: string) {
    await NotificationRepository.disableEmails(userId)
  },

  async markRead(userId: string, id: string) {
    const updated = await NotificationRepository.markRead(userId, id)
    if (!updated) throw new NotFoundError('Notification')
  },

  markAllRead(userId: string) {
    return NotificationRepository.markAllRead(userId)
  },
}
