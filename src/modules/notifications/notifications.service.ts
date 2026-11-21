import { z } from 'zod'
import { config } from '../../config/env'
import { BadRequestError, NotFoundError } from '../../core/errors'
import { logger } from '../../core/logger'
import { nextChargeDate } from '../../utils/subscription-dates'
import { createGoalContributionPath } from '../../utils/goal-contribution-token'
import { createUnsubscribeUrl } from '../../utils/unsubscribe'
import {
  currentPeriod,
  isOccurrence,
  recipientNameFor,
} from '../../utils/goal-schedule'
import { NotificationRepository, NewNotification } from './notifications.repository'
import { FINANCE_FROM_NAME, notificationSender, NotificationSender } from './notification-sender'
import {
  DAYS_BEFORE,
  DaysBefore,
  NotificationRules,
  NotificationType,
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
  // Opcional para no romper clientes que guardaron las reglas antes de existir.
  goalReminder: z
    .object({
      enabled: z.boolean(),
      emailEnabled: z.boolean().default(false),
    })
    .default({ enabled: false, emailEnabled: false }),
})

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function emailEnabledFor(type: NotificationType, rules: NotificationRules): boolean {
  switch (type) {
    case 'subscription_due':
      return rules.subscriptionDue.emailEnabled
    case 'spending_summary':
      return rules.spendingSummary.emailEnabled
    case 'goal_reminder':
    case 'goal_contribution':
      return rules.goalReminder.emailEnabled
  }
}

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

/** Variación porcentual redondeada; null cuando no hay base comparable. */
function trendFor(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

function monthLong(date: Date): string {
  return new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' }).format(date)
}

/** Etiqueta legible para el correo: «16–22 de noviembre» o «noviembre 2026». */
function displayPeriodFor(frequency: SummaryFrequency, start: Date, end: Date): string {
  if (frequency === 'monthly') {
    return new Intl.DateTimeFormat('es-ES', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(start)
  }
  const last = new Date(end.getTime() - 24 * 60 * 60 * 1000)
  const sameMonth =
    start.getUTCMonth() === last.getUTCMonth() && start.getUTCFullYear() === last.getUTCFullYear()
  if (!sameMonth) {
    const long = new Intl.DateTimeFormat('es-ES', {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    })
    return `${long.format(start)}–${long.format(last)}`
  }
  return `${start.getUTCDate()}–${last.getUTCDate()} de ${monthLong(start)}`
}

export interface ProcessResult {
  processed: number
  emailsSent: number
  emailsFailed: number
  contributionsCreated: number
  contributionsSkipped: number
}

interface GoalForReminder {
  id: string
  name: string
  targetAmount: number
  reminderFrequency?: string | null
  reminderChannel?: string | null
  reminderWeekday?: number | null
  reminderDay?: number | null
  reminderLastDay?: boolean | null
  reminderInterval?: number | null
  reminderIntervalUnit?: string | null
  reminderStartDate?: Date | null
  reminderAmount: number | null
  saved: number
  accountId?: string | null
  reminderEnabled?: boolean
}

/** Aportación que debe proponerse en esta ocurrencia, o null si no es elegible. */
function reminderContributionFor(goal: GoalForReminder, now: Date) {
  if (!goal.reminderEnabled) return null
  if (!goal.accountId) return null
  if (!isOccurrence(goal, now)) return null

  const period = currentPeriod(goal, now)
  if (!period) return null

  const saved = round2(goal.saved)
  if (saved >= round2(goal.targetAmount)) return null

  const amount = goal.reminderAmount == null ? null : round2(goal.reminderAmount)
  if (amount !== null && amount <= 0) return null

  return { period, amount, goalAccountId: goal.accountId }
}

/** Solo las metas con canal app+email pueden adjuntar correo; la campana siempre se crea. */
function emailForGoal(goal: GoalForReminder) {
  return goal.reminderChannel === undefined || goal.reminderChannel === null
    ? true
    : goal.reminderChannel === 'APP_AND_EMAIL'
}

export const NotificationService = {
  async getRules(userId: string): Promise<NotificationRules> {
    const rules = await NotificationRepository.findRules(userId)
    const subscription = rules.find((rule) => rule.type === 'subscription_due')
    const summary = rules.find((rule) => rule.type === 'spending_summary')
    const reminder = rules.find((rule) => rule.type === 'goal_reminder')

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
      goalReminder: {
        enabled: reminder?.enabled ?? false,
        emailEnabled: reminder?.emailEnabled ?? false,
      },
    }
  },

  async saveRules(userId: string, body: unknown): Promise<NotificationRules> {
    const parsed = saveRulesSchema.safeParse(body)
    if (!parsed.success) {
      throw new BadRequestError(
        'Reglas de notificación inválidas: usa enabled, emailEnabled, daysBefore (1, 3 o 7), frequency (weekly o monthly) y goalReminder'
      )
    }

    const { subscriptionDue, spendingSummary, goalReminder } = parsed.data
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
      NotificationRepository.saveRule(userId, 'goal_reminder', {
        enabled: goalReminder.enabled,
        emailEnabled: goalReminder.emailEnabled,
      }),
    ])

    return NotificationService.getRules(userId)
  },

  /** Genera los avisos de un usuario sin persistirlos ni enviar correos. */
  async collectNotifications(
    userId: string,
    rules: NotificationRules,
    now: Date,
    recipientName = ''
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
              recipientName,
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
      const spending = await NotificationRepository.summaryForPeriod(userId, start, end)
      if (spending.count > 0) {
        const length = end.getTime() - start.getTime()
        const previousStart = new Date(start.getTime() - length)
        const previous = await NotificationRepository.summaryForPeriod(userId, previousStart, start)
        const month = start.getUTCMonth() + 1
        const year = start.getUTCFullYear()
        const budget = await NotificationRepository.monthlyBudgetTotal(userId, month, year)
        const frontendBase = config.frontendUrl.replace(/\/$/, '')

        notifications.push({
          key: `summary:${rules.spendingSummary.frequency}:${key}`,
          type: 'spending_summary',
          title: 'Resumen de gastos',
          body: `Has gastado ${money.format(spending.spent)} ${label} en ${spending.count} ${spending.count === 1 ? 'movimiento' : 'movimientos'}.`,
          email: {
            template: 'spending_summary',
            data: {
              recipientName,
              period: displayPeriodFor(rules.spendingSummary.frequency, start, end),
              frequency: rules.spendingSummary.frequency,
              budgetMonth: monthLong(start),
              total: spending.spent,
              spentTrend: trendFor(spending.spent, previous.spent),
              income: spending.income,
              incomeTrend: trendFor(spending.income, previous.income),
              categories: spending.categories,
              budget,
              dashboardUrl: `${frontendBase}/`,
              manageUrl: `${frontendBase}/preferences`,
              unsubscribeUrl: createUnsubscribeUrl(userId),
            },
          },
        })
      }
    }

    if (rules.goalReminder.enabled) {
      const goals = await NotificationRepository.findGoalsWithReminder(userId)

      for (const goal of goals) {
        const reminder = reminderContributionFor(goal, now)
        if (!reminder) continue

        const acceptPath = createGoalContributionPath(userId, goal.id, reminder.period)
        notifications.push({
          key: `goal_contribution:${goal.id}:${reminder.period}`,
          type: 'goal_contribution',
          title: `Recordatorio de meta: ${goal.name}`,
          body: 'Tienes una aportación pendiente. Confírmala desde aquí.',
          actionUrl: acceptPath,
          ...(emailForGoal(goal)
            ? {
                email: {
                  template: 'goal_contribution_accept' as const,
                  data: {
                    recipientName,
                    goalName: goal.name,
                    saved: round2(goal.saved),
                    targetAmount: round2(goal.targetAmount),
                    suggestedAmount: reminder.amount,
                    acceptUrl: `${config.frontendUrl.replace(/\/$/, '')}${acceptPath}`,
                    // El micro valida la URL con z.string().url(): nunca relativa.
                    manageUrl: `${config.frontendUrl.replace(/\/$/, '')}/preferences`,
                    unsubscribeUrl: createUnsubscribeUrl(userId),
                  },
                },
              }
            : {}),
        })
      }
    }

    return notifications
  },

  /** Crea la fila pendiente del mes, una por meta con aviso elegible. */
  async ensureScheduledContributions(userId: string, now: Date) {
    const goals = await NotificationRepository.findGoalsWithReminder(userId)
    let created = 0
    let skipped = 0

    for (const goal of goals) {
      const reminder = reminderContributionFor(goal, now)
      const key = `goal_contribution:${goal.id}:${reminder?.period ?? currentPeriod(goal, now) ?? 'unknown'}`

      if (!reminder) {
        skipped += 1
        logger.info('Aviso de meta omitido', { userId, goalId: goal.id, key, reason: 'not_eligible' })
        continue
      }

      const wasCreated = await NotificationRepository.ensureGoalContribution({
        userId,
        goalId: goal.id,
        ...reminder,
      })

      if (wasCreated) {
        created += 1
        logger.info('Aviso de meta generado', {
          userId,
          goalId: goal.id,
          period: reminder.period,
          key,
          result: 'created',
        })
      } else {
        skipped += 1
        logger.info('Aviso de meta ya existente', {
          userId,
          goalId: goal.id,
          period: reminder.period,
          key,
          result: 'skipped',
        })
      }
    }

    return { created, skipped }
  },

  async list(userId: string): Promise<NotificationsResponse> {
    const rules = await NotificationService.getRules(userId)
    const now = new Date()

    // La campana crea el aviso de la aportación con su enlace de aceptación.
    // La fila tiene que existir antes, o el enlace daría «ya no está disponible».
    if (rules.goalReminder.enabled) {
      await NotificationService.ensureScheduledContributions(userId, now)
    }

    const notifications = await NotificationService.collectNotifications(userId, rules, now)
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
    const result: ProcessResult = {
      processed: 0,
      emailsSent: 0,
      emailsFailed: 0,
      contributionsCreated: 0,
      contributionsSkipped: 0,
    }

    for (const user of users) {
      const rules = await NotificationService.getRules(user.id)

      if (rules.goalReminder.enabled) {
        const contributions = await NotificationService.ensureScheduledContributions(user.id, now)
        result.contributionsCreated += contributions.created
        result.contributionsSkipped += contributions.skipped
      }

      const notifications = await NotificationService.collectNotifications(
        user.id,
        rules,
        now,
        recipientNameFor(user)
      )
      const created = await NotificationRepository.createNotifications(user.id, notifications)
      result.processed += created.length

      const emailable = notifications.filter(
        (notification) => notification.email && emailEnabledFor(notification.type, rules)
      )
      if (emailable.length === 0) continue

      const pending = await NotificationRepository.findPendingEmailKeys(
        user.id,
        emailable.map((notification) => notification.key)
      )

      for (const notification of emailable) {
        if (!pending.has(notification.key) || !notification.email) continue

        try {
          await sender.send({
            to: user.email,
            fromName: FINANCE_FROM_NAME,
            template: notification.email.template,
            data: notification.email.data,
            idempotencyKey: `finance:${notification.key}`,
          })
          await NotificationRepository.markEmailsSent(user.id, [notification.key])
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
