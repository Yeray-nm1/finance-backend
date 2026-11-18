import { BadRequestError, ConflictError } from '../../core/errors'
import { logger } from '../../core/logger'
import { AccountService } from '../accounts/accounts.service'
import { createTransactionHash } from '../../utils/hash'
import {
  GoalContributionTokenPayload,
  verifyGoalContributionToken,
} from '../../utils/goal-contribution-token'
import { GoalContributionRepository } from './goal-contributions.repository'

const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

function round2(value: number): number {
  return Math.round(value * 100) / 100
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
      amount: round2(contribution.amount),
      period: contribution.period,
      goalName: contribution.goal.name,
      status: contribution.status,
      goalAccountId: contribution.goalAccountId,
      accounts: accounts
        .filter((account) => account.id !== contribution.goalAccountId)
        .map((account) => ({ id: account.id, name: account.name, type: account.type })),
    }
  },

  async accept(userId: string, token: string, accountId: string, now: Date = new Date()) {
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
      amount: round2(contribution.amount),
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

    if (!contribution.goal.contributionScheduled) {
      throw new ConflictError('La aportación ya no está programada')
    }

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
      -Math.abs(contribution.amount),
      `goal_contribution:${payload.goalId}:${payload.period}`
    )
    const notificationKey = `goal_contribution_accepted:${payload.goalId}:${payload.period}`

    logger.info('Aceptando aportación programada', {
      userId,
      goalId: payload.goalId,
      period: payload.period,
      contributionId: contribution.id,
    })

    const result = await GoalContributionRepository.acceptInTransaction({
      userId,
      goalId: payload.goalId,
      period: payload.period,
      amount: contribution.amount,
      goalAccountId: contribution.goalAccountId,
      sourceAccountId: accountId,
      date: now,
      description,
      hash,
      notificationKey,
      notificationTitle: `Aportación confirmada: ${contribution.goal.name}`,
      notificationBody: `Se ha registrado la aportación de ${money.format(round2(contribution.amount))} a la cuenta de ahorro de «${contribution.goal.name}».`,
    })

    return {
      ...details,
      status: 'accepted',
      sourceAccountId: accountId,
      alreadyAccepted: false,
      transaction: result.transaction,
    }
  },
}
