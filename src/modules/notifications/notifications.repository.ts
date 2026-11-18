import { Prisma } from '@prisma/client'
import { prisma } from '../../core/db'
import { createGoalContributionPath } from '../../utils/goal-contribution-token'
import { normalizeDescription } from '../../utils/normalize'
import type {
  NotificationEmailPayload,
  NotificationItem,
  NotificationType,
} from './notifications.types'

export interface NewNotification {
  key: string
  type: NotificationType
  title: string
  body: string
  actionUrl?: string | null
  email?: NotificationEmailPayload
}

/**
 * Los avisos creados antes de existir `actionUrl` no lo tienen guardado, pero su
 * clave conserva la meta y el periodo, así que podemos recompondérlo al listar.
 */
function actionUrlForRow(row: {
  key: string
  type: string
  userId: string
  actionUrl: string | null
}): string | null {
  if (row.actionUrl) return row.actionUrl
  if (row.type !== 'goal_contribution') return null

  const match = /^goal_contribution:([^:]+):(\d{4}-\d{2})$/.exec(row.key)
  return match ? createGoalContributionPath(row.userId, match[1], match[2]) : null
}

type RuleData = {
  enabled?: boolean
  emailEnabled?: boolean
  daysBefore?: number
  summaryFrequency?: string
}

export const NotificationRepository = {
  findRules(userId: string) {
    return prisma.notificationRule.findMany({ where: { userId } })
  },

  async saveRule(userId: string, type: string, data: RuleData) {
    const existing = await prisma.notificationRule.findFirst({ where: { userId, type } })
    if (existing) {
      return prisma.notificationRule.update({ where: { id: existing.id }, data })
    }
    return prisma.notificationRule.create({ data: { userId, type, ...data } })
  },

  /** Inserta los avisos nuevos y devuelve solo los creados (para saber cuáles notificar por email). */
  async createNotifications(userId: string, items: NewNotification[]): Promise<NewNotification[]> {
    if (items.length === 0) return []

    const keys = items.map((item) => item.key)
    const existing = await prisma.notification.findMany({
      where: { userId, key: { in: keys } },
      select: { key: true },
    })
    const seen = new Set(existing.map((row) => row.key))
    const created = items.filter((item) => !seen.has(item.key))
    if (created.length === 0) return []

    await prisma.notification.createMany({
      data: created.map((item) => ({
        key: item.key,
        type: item.type,
        title: item.title,
        body: item.body,
        actionUrl: item.actionUrl ?? null,
        userId,
      })),
      skipDuplicates: true,
    })
    return created
  },

  /**
   * Claves cuyo correo aún no se ha entregado. Se consulta después de crear los
   * avisos para que un aviso generado por `/notifications` no cancele el email.
   */
  async findPendingEmailKeys(userId: string, keys: string[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set()

    const rows = await prisma.notification.findMany({
      where: { userId, key: { in: keys }, emailSentAt: null },
      select: { key: true },
    })
    return new Set(rows.map((row) => row.key))
  },

  async markEmailsSent(userId: string, keys: string[]): Promise<void> {
    if (keys.length === 0) return

    await prisma.notification.updateMany({
      where: { userId, key: { in: keys } },
      data: { emailSentAt: new Date() },
    })
  },

  /** Usuarios con al menos una regla activa: son los que debe barrer el job. */
  findUsersWithNotifications() {
    return prisma.user.findMany({
      where: { notificationRules: { some: { enabled: true } } },
      select: { id: true, email: true },
    })
  },

  async disableEmails(userId: string) {
    await prisma.notificationRule.updateMany({
      where: { userId },
      data: { emailEnabled: false },
    })
  },

  async list(userId: string): Promise<NotificationItem[]> {
    const rows = await prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    })
    return rows.map((row) => ({
      id: row.id,
      type: row.type as NotificationType,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt ? row.readAt.toISOString() : null,
      actionUrl: actionUrlForRow(row),
    }))
  },

  countUnread(userId: string) {
    return prisma.notification.count({ where: { userId, readAt: null } })
  },

  async markRead(userId: string, id: string) {
    const result = await prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    })
    return result.count > 0
  },

  async markAllRead(userId: string) {
    await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    })
  },

  findActiveSubscriptions(userId: string) {
    return prisma.subscription.findMany({
      where: { userId, active: true },
      orderBy: { name: 'asc' },
    })
  },

  async findLastCharge(userId: string, subscriptionId: string, name: string) {
    const linked = await prisma.transaction.findFirst({
      where: { userId, subscriptionId },
      orderBy: { date: 'desc' },
      select: { date: true },
    })
    if (linked) return linked.date

    const fallback = await prisma.transaction.findFirst({
      where: {
        userId,
        type: 'expense',
        description: { contains: normalizeDescription(name), mode: 'insensitive' },
      },
      orderBy: { date: 'desc' },
      select: { date: true },
    })
    return fallback?.date ?? null
  },

  async sumExpenses(userId: string, start: Date, end: Date) {
    const rows = await prisma.transaction.findMany({
      where: { userId, type: 'expense', date: { gte: start, lt: end } },
      select: { amount: true },
    })
    return {
      total: rows.reduce((sum, row) => sum + Math.abs(row.amount), 0),
      count: rows.length,
    }
  },

  /** Metas activas con recordatorio configurado, con el total ya aportado. */
  async findGoalsWithReminder(userId: string) {
    const goals = await prisma.savingsGoal.findMany({
      where: { userId, isArchived: false, reminderDay: { not: null } },
      select: {
        id: true,
        name: true,
        targetAmount: true,
        reminderDay: true,
        reminderAmount: true,
        accountId: true,
        contributionScheduled: true,
      },
      orderBy: { name: 'asc' },
    })

    if (goals.length === 0) return []

    const totals = await prisma.transaction.groupBy({
      by: ['goalId'],
      where: {
        userId,
        type: 'transfer',
        goalId: { in: goals.map((goal) => goal.id) },
      },
      _sum: { amount: true },
    })
    const saved = new Map(
      totals.map((row) => [row.goalId, Math.abs(row._sum.amount ?? 0)])
    )

    return goals.map((goal) => ({ ...goal, saved: saved.get(goal.id) ?? 0 }))
  },

  /**
   * Crea la aportación pendiente del periodo solo si no existe ya. Devuelve
   * `true` cuando la ha creado y `false` cuando ya estaba (segundo barrido).
   */
  async ensureGoalContribution(data: {
    userId: string
    goalId: string
    period: string
    amount: number
    goalAccountId: string
  }): Promise<boolean> {
    const where = { goalId_period: { goalId: data.goalId, period: data.period } }

    const existing = await prisma.goalContribution.findUnique({ where, select: { id: true } })
    if (existing) return false

    try {
      await prisma.goalContribution.create({ data })
      return true
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false
      }
      throw error
    }
  },
}
