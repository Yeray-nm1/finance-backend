import { prisma } from '../../core/db'
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
  email?: NotificationEmailPayload
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
        userId,
      })),
      skipDuplicates: true,
    })
    return created
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
}
