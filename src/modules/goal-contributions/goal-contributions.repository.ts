import { prisma } from '../../core/db'

export interface AcceptContributionInput {
  userId: string
  goalId: string
  period: string
  amount: number
  goalAccountId: string
  sourceAccountId: string
  date: Date
  description: string
  hash: string
  /** Solo se usa si se entrega una notificación legada; la aceptación ya no avisa en la campana. */
  notificationKey?: string
  notificationTitle?: string
  notificationBody?: string
  updateSuggestion: boolean
}

export const GoalContributionRepository = {
  findByPeriod(userId: string, goalId: string, period: string) {
    return prisma.goalContribution.findFirst({
      where: { userId, goalId, period },
      select: {
        id: true,
        userId: true,
        goalId: true,
        period: true,
        amount: true,
        goalAccountId: true,
        status: true,
        sourceAccountId: true,
        acceptedAt: true,
        createdAt: true,
        goal: {
          select: {
            name: true,
            reminderFrequency: true,
            reminderWeekday: true,
            reminderDay: true,
            reminderLastDay: true,
            reminderInterval: true,
            reminderIntervalUnit: true,
            reminderStartDate: true,
          },
        },
      },
    })
  },

  /** Estado y transferencia se escriben en una sola transacción. */
  async acceptInTransaction(input: AcceptContributionInput) {
    return prisma.$transaction(async (tx) => {
      const contribution = await tx.goalContribution.update({
        where: { goalId_period: { goalId: input.goalId, period: input.period } },
        data: {
          status: 'accepted',
          amount: input.amount,
          sourceAccountId: input.sourceAccountId,
          acceptedAt: input.date,
        },
      })

      if (input.updateSuggestion) {
        await tx.savingsGoal.update({
          where: { id: input.goalId },
          data: { reminderAmount: input.amount },
        })
      }

      const transaction = await tx.transaction.create({
        data: {
          userId: input.userId,
          date: input.date,
          amount: -Math.abs(input.amount),
          description: input.description,
          type: 'transfer',
          transferKind: 'internal',
          accountId: input.sourceAccountId,
          transferAccountId: input.goalAccountId,
          goalId: input.goalId,
          hash: input.hash,
        },
        include: { account: true, transferAccount: true },
      })

      if (input.notificationKey && input.notificationTitle && input.notificationBody) {
        await tx.notification.upsert({
          where: {
            userId_key: { userId: input.userId, key: input.notificationKey },
          },
          create: {
            userId: input.userId,
            key: input.notificationKey,
            type: 'goal_contribution',
            title: input.notificationTitle,
            body: input.notificationBody,
          },
          update: {},
        })
      }

      return { contribution, transaction }
    })
  },
}
