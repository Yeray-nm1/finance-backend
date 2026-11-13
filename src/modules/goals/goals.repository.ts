import { prisma } from '../../core/db'
import { Prisma } from '@prisma/client'

export type CreateGoalDTO = {
  name: string
  targetAmount: number
  targetDate?: Date | null
  accountId?: string | null
}

export type UpdateGoalDTO = Partial<CreateGoalDTO> & {
  isArchived?: boolean
}

export type CreateContributionDTO = {
  userId: string
  date: Date
  amount: number
  description: string
  accountId: string
  transferAccountId: string
  goalId: string
  hash: string
}

const goalListInclude = {
  account: true,
  _count: { select: { contributions: true } },
} satisfies Prisma.SavingsGoalInclude

const goalDetailInclude = {
  account: true,
  contributions: {
    include: { account: true, transferAccount: true },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  },
} satisfies Prisma.SavingsGoalInclude

export type GoalWithAccount = Prisma.SavingsGoalGetPayload<{
  include: typeof goalListInclude
}>

export type GoalWithDetail = Prisma.SavingsGoalGetPayload<{
  include: typeof goalDetailInclude
}>

export const GoalRepository = {
  async findAll(userId: string, includeArchived: boolean) {
    return prisma.savingsGoal.findMany({
      where: {
        userId,
        ...(includeArchived ? {} : { isArchived: false }),
      },
      include: goalListInclude,
      orderBy: [{ isArchived: 'asc' }, { createdAt: 'asc' }],
    })
  },

  async findById(userId: string, id: string) {
    return prisma.savingsGoal.findFirst({
      where: { id, userId },
      include: goalDetailInclude,
    })
  },

  async sumContributions(userId: string, goalIds: string[]) {
    if (goalIds.length === 0) return new Map<string, number>()

    const rows = await prisma.transaction.findMany({
      where: {
        userId,
        type: 'transfer',
        goalId: { in: goalIds },
      },
      select: { goalId: true, amount: true },
    })

    const totals = new Map<string, number>()

    for (const row of rows) {
      if (!row.goalId) continue
      totals.set(row.goalId, (totals.get(row.goalId) ?? 0) + Math.abs(row.amount))
    }

    return totals
  },

  async create(userId: string, dto: CreateGoalDTO) {
    return prisma.savingsGoal.create({
      data: {
        userId,
        name: dto.name,
        targetAmount: dto.targetAmount,
        targetDate: dto.targetDate ?? null,
        accountId: dto.accountId ?? null,
      },
      include: goalListInclude,
    })
  },

  async update(userId: string, id: string, dto: UpdateGoalDTO) {
    const result = await prisma.savingsGoal.updateMany({
      where: { id, userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.targetAmount !== undefined ? { targetAmount: dto.targetAmount } : {}),
        ...(dto.targetDate !== undefined ? { targetDate: dto.targetDate } : {}),
        ...(dto.accountId !== undefined ? { accountId: dto.accountId } : {}),
        ...(dto.isArchived !== undefined ? { isArchived: dto.isArchived } : {}),
      },
    })

    if (result.count === 0) return null

    return GoalRepository.findById(userId, id)
  },

  async delete(userId: string, id: string) {
    return prisma.savingsGoal.deleteMany({ where: { id, userId } })
  },

  async createContribution(dto: CreateContributionDTO) {
    return prisma.transaction.create({
      data: {
        userId: dto.userId,
        date: dto.date,
        amount: dto.amount,
        description: dto.description,
        type: 'transfer',
        transferKind: 'internal',
        accountId: dto.accountId,
        transferAccountId: dto.transferAccountId,
        goalId: dto.goalId,
        hash: dto.hash,
      },
      include: { account: true, transferAccount: true },
    })
  },

  async deleteContribution(userId: string, goalId: string, transactionId: string) {
    return prisma.transaction.deleteMany({
      where: {
        id: transactionId,
        userId,
        goalId,
      },
    })
  },
}
