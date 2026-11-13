import { randomUUID } from 'crypto'
import {
  GoalRepository,
  GoalWithAccount,
  GoalWithDetail,
} from './goals.repository'
import { BadRequestError, NotFoundError } from '../../core/errors'
import { AccountService } from '../accounts/accounts.service'
import { createTransactionHash } from '../../utils/hash'

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestError('El nombre de la meta es obligatorio')
  }

  const trimmed = value.trim()

  if (!trimmed) {
    throw new BadRequestError('El nombre de la meta es obligatorio')
  }

  return trimmed
}

function validateTargetAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new BadRequestError('El importe objetivo debe ser un número mayor que cero')
  }

  return round2(value)
}

function parseTargetDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null

  if (typeof value !== 'string') {
    throw new BadRequestError('La fecha objetivo no es válida')
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestError('La fecha objetivo no es válida')
  }

  return date
}

function validateContributionAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new BadRequestError('La aportación debe ser un número mayor que cero')
  }

  return round2(value)
}

function validateDate(value: unknown): Date {
  if (typeof value !== 'string') {
    throw new BadRequestError('La fecha de la aportación no es válida')
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestError('La fecha de la aportación no es válida')
  }

  return date
}

async function resolveSavingsAccount(
  userId: string,
  value: unknown
): Promise<string | null> {
  if (value === null || value === undefined || value === '') return null

  if (typeof value !== 'string') {
    throw new BadRequestError('La cuenta de la meta no es válida')
  }

  const account = await AccountService.getById(userId, value)

  if (account.type !== 'savings') {
    throw new BadRequestError('La cuenta de la meta debe ser de ahorro')
  }

  return account.id
}

function monthlyNeeded(remaining: number, targetDate: Date | null): number | null {
  if (!targetDate || remaining <= 0) return null

  const days = Math.ceil((targetDate.getTime() - Date.now()) / 86_400_000)
  const months = Math.max(1, Math.ceil(days / 30.44))

  return round2(remaining / months)
}

function serializeGoal(
  goal: {
    id: string
    name: string
    targetAmount: number
    targetDate: Date | null
    accountId: string | null
    account: GoalWithAccount['account']
    isArchived: boolean
    createdAt: Date
    updatedAt: Date
  },
  saved: number,
  contributionsCount: number
) {
  const targetAmount = round2(goal.targetAmount)
  const totalSaved = round2(saved)
  const remaining = Math.max(0, round2(targetAmount - totalSaved))
  const progress = targetAmount > 0
    ? round2(Math.min(100, (totalSaved / targetAmount) * 100))
    : 0

  return {
    id: goal.id,
    name: goal.name,
    targetAmount,
    targetDate: goal.targetDate?.toISOString() ?? null,
    accountId: goal.accountId,
    account: goal.account,
    isArchived: goal.isArchived,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
    saved: totalSaved,
    progress,
    remaining,
    monthlyNeeded: monthlyNeeded(remaining, goal.targetDate),
    contributionsCount,
  }
}

function savedFromContributions(goal: GoalWithDetail): number {
  return goal.contributions
    .filter((transaction) => transaction.type === 'transfer')
    .reduce((total, transaction) => total + Math.abs(transaction.amount), 0)
}

function serializeContribution(goal: GoalWithDetail) {
  return goal.contributions
    .filter((transaction) => transaction.type === 'transfer')
    .map((transaction) => ({
      id: transaction.id,
      amount: round2(Math.abs(transaction.amount)),
      date: transaction.date.toISOString(),
      description: transaction.description,
      account: transaction.account,
      transferAccount: transaction.transferAccount,
      createdAt: transaction.createdAt,
    }))
}

function serializeGoalDetail(goal: GoalWithDetail) {
  const contributions = serializeContribution(goal)

  return {
    ...serializeGoal(goal, savedFromContributions(goal), contributions.length),
    contributions,
  }
}

export const GoalService = {
  async getAll(userId: string, includeArchived: boolean) {
    const goals = await GoalRepository.findAll(userId, includeArchived)
    const totals = await GoalRepository.sumContributions(
      userId,
      goals.map((goal) => goal.id)
    )

    return goals.map((goal) => serializeGoal(goal, totals.get(goal.id) ?? 0, goal._count.contributions))
  },

  async getById(userId: string, id: string) {
    const goal = await GoalRepository.findById(userId, id)

    if (!goal) {
      throw new NotFoundError('Goal')
    }

    return serializeGoalDetail(goal)
  },

  async create(
    userId: string,
    dto: { name: unknown; targetAmount: unknown; targetDate?: unknown; accountId?: unknown }
  ) {
    const goal = await GoalRepository.create(userId, {
      name: normalizeName(dto.name),
      targetAmount: validateTargetAmount(dto.targetAmount),
      targetDate: parseTargetDate(dto.targetDate),
      accountId: await resolveSavingsAccount(userId, dto.accountId),
    })

    return serializeGoal(goal, 0, 0)
  },

  async update(
    userId: string,
    id: string,
    dto: {
      name?: unknown
      targetAmount?: unknown
      targetDate?: unknown
      accountId?: unknown
      isArchived?: unknown
    }
  ) {
    const existing = await GoalRepository.findById(userId, id)

    if (!existing) {
      throw new NotFoundError('Goal')
    }

    const data: Parameters<typeof GoalRepository.update>[2] = {}

    if (dto.name !== undefined) data.name = normalizeName(dto.name)
    if (dto.targetAmount !== undefined) data.targetAmount = validateTargetAmount(dto.targetAmount)
    if (dto.targetDate !== undefined) data.targetDate = parseTargetDate(dto.targetDate)
    if (dto.accountId !== undefined) {
      data.accountId = await resolveSavingsAccount(userId, dto.accountId)
    }
    if (dto.isArchived !== undefined) data.isArchived = dto.isArchived === true

    const goal = await GoalRepository.update(userId, id, data)

    if (!goal) {
      throw new NotFoundError('Goal')
    }

    return serializeGoalDetail(goal)
  },

  async delete(userId: string, id: string) {
    const existing = await GoalRepository.findById(userId, id)

    if (!existing) {
      throw new NotFoundError('Goal')
    }

    await GoalRepository.delete(userId, id)
  },

  async contribute(
    userId: string,
    goalId: string,
    dto: { amount: unknown; date: unknown; accountId: unknown }
  ) {
    const goal = await GoalRepository.findById(userId, goalId)

    if (!goal) {
      throw new NotFoundError('Goal')
    }

    if (!goal.accountId) {
      throw new BadRequestError('La meta no tiene cuenta de ahorro asociada')
    }

    const amount = validateContributionAmount(dto.amount)
    const date = validateDate(dto.date)

    if (typeof dto.accountId !== 'string' || !dto.accountId) {
      throw new BadRequestError('La cuenta origen es obligatoria')
    }

    const accountId = await AccountService.getOwnedId(userId, dto.accountId)

    if (accountId === goal.accountId) {
      throw new BadRequestError('La cuenta origen debe ser distinta de la cuenta de la meta')
    }

    const description = `Aportación a ${goal.name}`
    const signedAmount = -Math.abs(amount)
    const hash = createTransactionHash(
      date.toISOString(),
      signedAmount,
      `${description}-${randomUUID()}`
    )

    const transaction = await GoalRepository.createContribution({
      userId,
      date,
      amount: signedAmount,
      description,
      accountId,
      transferAccountId: goal.accountId,
      goalId: goal.id,
      hash,
    })

    return {
      id: transaction.id,
      amount: round2(Math.abs(transaction.amount)),
      date: transaction.date.toISOString(),
      description: transaction.description,
      account: transaction.account,
      transferAccount: transaction.transferAccount,
      createdAt: transaction.createdAt,
    }
  },

  async deleteContribution(userId: string, goalId: string, transactionId: string) {
    const goal = await GoalRepository.findById(userId, goalId)

    if (!goal) {
      throw new NotFoundError('Goal')
    }

    const result = await GoalRepository.deleteContribution(userId, goalId, transactionId)

    if (result.count === 0) {
      throw new NotFoundError('Contribution')
    }
  },
}
