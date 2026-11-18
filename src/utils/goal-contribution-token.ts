import jwt from 'jsonwebtoken'
import { config } from '../config/env'

export const GOAL_CONTRIBUTION_TOKEN_SCOPE = 'goal_contribution' as const

export interface GoalContributionTokenPayload {
  sub: string
  scope: typeof GOAL_CONTRIBUTION_TOKEN_SCOPE
  goalId: string
  period: string
}

/**
 * Token sin `iat`, `exp` ni `jti`: la URL del correo debe ser idéntica en cada
 * reintento del barrido para que el idempotency key del micro no cambie. La
 * vigencia se controla con el estado de la aportación y el periodo actual.
 */
export function createGoalContributionToken(userId: string, goalId: string, period: string): string {
  return jwt.sign(
    {
      sub: userId,
      scope: GOAL_CONTRIBUTION_TOKEN_SCOPE,
      goalId,
      period,
    },
    config.jwtSecret,
    { noTimestamp: true }
  )
}

export function verifyGoalContributionToken(token: string): GoalContributionTokenPayload | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as Partial<GoalContributionTokenPayload>
    return payload.scope === GOAL_CONTRIBUTION_TOKEN_SCOPE &&
      typeof payload.sub === 'string' &&
      typeof payload.goalId === 'string' &&
      typeof payload.period === 'string'
      ? {
          sub: payload.sub,
          scope: GOAL_CONTRIBUTION_TOKEN_SCOPE,
          goalId: payload.goalId,
          period: payload.period,
        }
      : null
  } catch {
    return null
  }
}

/** Ruta relativa de aceptación: sirve para el correo y para la acción in-app. */
export function createGoalContributionPath(
  userId: string,
  goalId: string,
  period: string
): string {
  return `/goals/aceptar?token=${encodeURIComponent(
    createGoalContributionToken(userId, goalId, period)
  )}`
}

export function createGoalContributionUrl(userId: string, goalId: string, period: string): string {
  const base = config.frontendUrl.replace(/\/$/, '')
  return `${base}${createGoalContributionPath(userId, goalId, period)}`
}
