import { BadRequestError, ConflictError } from '../../core/errors'
import { logger } from '../../core/logger'
import { AccountService } from '../accounts/accounts.service'
import { createTransactionHash } from '../../utils/hash'
import {
  GoalContributionTokenPayload,
  verifyGoalContributionToken,
} from '../../utils/goal-contribution-token'
import { GoalContributionRepository } from './goal-contributions.repository'

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function validateAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new BadRequestError('El importe de la aportación debe ser un número mayor que cero')
  }

  return round2(value)
}

function validateUpdateSuggestion(value: unknown): boolean {
  if (value === undefined || value === null) return false

  if (typeof value !== 'boolean') {
    throw new BadRequestError('La actualización del importe sugerido debe ser verdadero o falso')
  }

  return value
}

function requireToken(userId: string, token: string): GoalContributionTokenPayload {
  const payload = verifyGoalContributionToken(token)

  if (!payload || payload.sub !== userId) {
    throw new BadRequestError('Enlace de aportación no válido')
  }

  return payload
}

export const GoalContributionService = {
  async getPending(userId: string, token: string) {
    const payload = requireToken(userId, token)
    const contribution = await GoalContributionRepository.findByPeriod(
      userId,
      payload.goalId,
      payload.period
    )

    if (!contribution) {
      throw new ConflictError('La aportación ya no está disponible')
    }

    const accounts = await AccountService.getAll(userId)

    return {
      id: contribution.id,
      goalId: contribution.goalId,
      amount: contribution.amount == null ? null : round2(contribution.amount),
      period: contribution.period,
      goalName: contribution.goal.name,
      status: contribution.status,
      goalAccountId: contribution.goalAccountId,
      accounts: accounts
        .filter((account) => account.id !== contribution.goalAccountId)
        .map((account) => ({ id: account.id, name: account.name, type: account.type })),
    }
  },

  async accept(
    userId: string,
    token: string,
    accountId: string,
    dto: { amount: unknown; updateSuggestion?: unknown },
    now: Date = new Date()
  ) {
    const payload = requireToken(userId, token)
    const contribution = await GoalContributionRepository.findByPeriod(
      userId,
      payload.goalId,
      payload.period
    )

    if (!contribution) {
      throw new ConflictError('La aportación ya no está disponible')
    }

    const details = {
      id: contribution.id,
      amount: contribution.amount == null ? null : round2(contribution.amount),
      period: contribution.period,
      goalName: contribution.goal.name,
      goalAccountId: contribution.goalAccountId,
      status: contribution.status,
      sourceAccountId: contribution.sourceAccountId,
    }

    if (contribution.status === 'accepted') {
      return { ...details, alreadyAccepted: true }
    }

    if (payload.period !== now.toISOString().slice(0, 7)) {
      throw new ConflictError('El periodo de la aportación ya ha terminado')
    }

    const amount = validateAmount(dto.amount)
    const updateSuggestion = validateUpdateSuggestion(dto.updateSuggestion)

    const accounts = await AccountService.getAll(userId)
    if (!accounts.some((account) => account.id === accountId)) {
      throw new BadRequestError('La cuenta origen no es válida')
    }
    if (accountId === contribution.goalAccountId) {
      throw new BadRequestError('La cuenta origen debe ser distinta de la cuenta de la meta')
    }

    const description = `Aportación a ${contribution.goal.name}`
    const hash = createTransactionHash(
      now.toISOString(),
      -amount,
      `goal_contribution:${payload.goalId}:${payload.period}`
    )
    logger.info('Aceptando aviso de meta', {
      userId,
      goalId: payload.goalId,
      period: payload.period,
      contributionId: contribution.id,
    })

    const result = await GoalContributionRepository.acceptInTransaction({
      userId,
      goalId: payload.goalId,
      period: payload.period,
      amount,
      goalAccountId: contribution.goalAccountId,
      sourceAccountId: accountId,
      date: now,
      description,
      hash,
      updateSuggestion,
    })

    return {
      ...details,
      amount,
      status: 'accepted',
      sourceAccountId: accountId,
      alreadyAccepted: false,
      transaction: result.transaction,
    }
  },
}
