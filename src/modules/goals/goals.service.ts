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

function validateReminderDay(value: unknown): number | null {
  if (value === null || value === undefined) return null

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 31) {
    throw new BadRequestError('El día del recordatorio debe estar entre 1 y 31')
  }

  return value
}

type GoalReminderFrequency = 'WEEKLY' | 'MONTHLY' | 'CUSTOM'
type GoalReminderChannel = 'APP_ONLY' | 'APP_AND_EMAIL'
type GoalReminderIntervalUnit = 'DAYS' | 'WEEKS' | 'MONTHS'

const FREQUENCIES: GoalReminderFrequency[] = ['WEEKLY', 'MONTHLY', 'CUSTOM']
const CHANNELS: GoalReminderChannel[] = ['APP_ONLY', 'APP_AND_EMAIL']
const INTERVAL_UNITS: GoalReminderIntervalUnit[] = ['DAYS', 'WEEKS', 'MONTHS']

export interface ReminderSettings {
  reminderFrequency: GoalReminderFrequency
  reminderChannel: GoalReminderChannel
  reminderWeekday: number | null
  reminderDay: number | null
  reminderLastDay: boolean
  reminderInterval: number | null
  reminderIntervalUnit: GoalReminderIntervalUnit | null
  reminderStartDate: Date | null
}

type ReminderInput = {
  reminderFrequency?: unknown
  reminderChannel?: unknown
  reminderWeekday?: unknown
  reminderDay?: unknown
  reminderLastDay?: unknown
  reminderInterval?: unknown
  reminderIntervalUnit?: unknown
  reminderStartDate?: unknown
}

function pickEnum<T extends string>(value: unknown, allowed: T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new BadRequestError(`${label} no es válido`)
  }
  return value as T
}

function validateWeekday(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 7) {
    throw new BadRequestError('El día de la semana debe estar entre 1 (lunes) y 7 (domingo)')
  }
  return value
}

function validateLastDay(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value !== 'boolean') {
    throw new BadRequestError('«Usar el último día del mes» debe ser verdadero o falso')
  }
  return value
}

function validateInterval(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new BadRequestError('El intervalo debe ser un número entero mayor o igual que 1')
  }
  return value
}

function parseStartDate(value: unknown): Date {
  if (typeof value !== 'string' || !value) {
    throw new BadRequestError('La fecha de inicio del aviso no es válida')
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestError('La fecha de inicio del aviso no es válida')
  }
  return date
}

/** Normaliza la programación y deja a null los campos que no usa la frecuencia elegida. */
function resolveReminderSettings(
  input: ReminderInput,
  reminderEnabled: boolean,
  existing?: ReminderSettings
): ReminderSettings {
  const frequency =
    input.reminderFrequency === undefined
      ? (existing?.reminderFrequency ?? 'MONTHLY')
      : pickEnum(input.reminderFrequency, FREQUENCIES, 'La frecuencia del aviso')
  const channel =
    input.reminderChannel === undefined
      ? (existing?.reminderChannel ?? 'APP_AND_EMAIL')
      : pickEnum(input.reminderChannel, CHANNELS, 'El canal del aviso')
  const lastDay =
    input.reminderLastDay === undefined
      ? (existing?.reminderLastDay ?? false)
      : validateLastDay(input.reminderLastDay)

  const settings: ReminderSettings = {
    reminderFrequency: frequency,
    reminderChannel: channel,
    reminderWeekday:
      input.reminderWeekday === undefined
        ? (existing?.reminderWeekday ?? null)
        : input.reminderWeekday === null
          ? null
          : validateWeekday(input.reminderWeekday),
    reminderDay:
      input.reminderDay === undefined
        ? (existing?.reminderDay ?? null)
        : validateReminderDay(input.reminderDay),
    reminderLastDay: lastDay,
    reminderInterval:
      input.reminderInterval === undefined
        ? (existing?.reminderInterval ?? null)
        : input.reminderInterval === null
          ? null
          : validateInterval(input.reminderInterval),
    reminderIntervalUnit:
      input.reminderIntervalUnit === undefined
        ? (existing?.reminderIntervalUnit ?? null)
        : input.reminderIntervalUnit === null
          ? null
          : pickEnum(input.reminderIntervalUnit, INTERVAL_UNITS, 'La unidad del intervalo'),
    reminderStartDate:
      input.reminderStartDate === undefined
        ? (existing?.reminderStartDate ?? null)
        : input.reminderStartDate === null
          ? null
          : parseStartDate(input.reminderStartDate),
  }

  // El toggle es maestro: con el aviso apagado se permite guardar una
  // programación incompleta (o borrarla) sin bloquear el resto de la meta.
  if (!reminderEnabled) return settings

  if (frequency === 'WEEKLY') {
    if (settings.reminderWeekday === null) {
      throw new BadRequestError('El aviso semanal requiere un día de la semana')
    }
    return {
      ...settings,
      reminderDay: null,
      reminderLastDay: false,
      reminderInterval: null,
      reminderIntervalUnit: null,
      reminderStartDate: null,
    }
  }

  if (frequency === 'MONTHLY') {
    if (!lastDay && settings.reminderDay === null) {
      throw new BadRequestError('El aviso mensual requiere un día o el último día del mes')
    }
    return {
      ...settings,
      reminderWeekday: null,
      reminderDay: lastDay ? null : settings.reminderDay,
      reminderInterval: null,
      reminderIntervalUnit: null,
      reminderStartDate: null,
    }
  }

  if (
    settings.reminderInterval === null ||
    settings.reminderIntervalUnit === null ||
    settings.reminderStartDate === null
  ) {
    throw new BadRequestError('El aviso personalizado requiere intervalo, unidad y fecha de inicio')
  }

  return {
    ...settings,
    reminderWeekday: null,
    reminderDay: null,
    reminderLastDay: false,
  }
}

const SCHEDULE_KEYS: (keyof ReminderInput)[] = [
  'reminderFrequency',
  'reminderChannel',
  'reminderWeekday',
  'reminderDay',
  'reminderLastDay',
  'reminderInterval',
  'reminderIntervalUnit',
  'reminderStartDate',
]

function hasScheduleChanges(dto: ReminderInput): boolean {
  return SCHEDULE_KEYS.some((key) => dto[key] !== undefined)
}

function settingsFromGoal(goal: {
  reminderFrequency?: string | null
  reminderChannel?: string | null
  reminderWeekday?: number | null
  reminderDay?: number | null
  reminderLastDay?: boolean | null
  reminderInterval?: number | null
  reminderIntervalUnit?: string | null
  reminderStartDate?: Date | null
}): ReminderSettings {
  return {
    reminderFrequency: pickEnum(
      goal.reminderFrequency ?? 'MONTHLY',
      FREQUENCIES,
      'La frecuencia del aviso'
    ),
    reminderChannel: pickEnum(
      goal.reminderChannel ?? 'APP_AND_EMAIL',
      CHANNELS,
      'El canal del aviso'
    ),
    reminderWeekday: goal.reminderWeekday ?? null,
    reminderDay: goal.reminderDay ?? null,
    reminderLastDay: goal.reminderLastDay ?? false,
    reminderInterval: goal.reminderInterval ?? null,
    reminderIntervalUnit: goal.reminderIntervalUnit
      ? pickEnum(goal.reminderIntervalUnit, INTERVAL_UNITS, 'La unidad del intervalo')
      : null,
    reminderStartDate: goal.reminderStartDate ?? null,
  }
}

function validateReminderAmount(value: unknown): number | null {
  if (value === null || value === undefined) return null

  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new BadRequestError('El importe sugerido debe ser un número mayor que cero')
  }

  return round2(value)
}

function validateReminderEnabled(value: unknown): boolean {
  if (value === undefined || value === null) return false

  if (typeof value !== 'boolean') {
    throw new BadRequestError('El aviso de la meta debe ser verdadero o falso')
  }

  return value
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
    reminderFrequency?: string | null
    reminderChannel?: string | null
    reminderWeekday?: number | null
    reminderDay?: number | null
    reminderLastDay?: boolean | null
    reminderInterval?: number | null
    reminderIntervalUnit?: string | null
    reminderStartDate?: Date | null
    reminderAmount?: number | null
    reminderEnabled?: boolean
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
    reminderFrequency: goal.reminderFrequency ?? 'MONTHLY',
    reminderChannel: goal.reminderChannel ?? 'APP_AND_EMAIL',
    reminderWeekday: goal.reminderWeekday ?? null,
    reminderDay: goal.reminderDay ?? null,
    reminderLastDay: goal.reminderLastDay ?? false,
    reminderInterval: goal.reminderInterval ?? null,
    reminderIntervalUnit: goal.reminderIntervalUnit ?? null,
    reminderStartDate: goal.reminderStartDate?.toISOString() ?? null,
    reminderAmount: goal.reminderAmount == null ? null : round2(goal.reminderAmount),
    reminderEnabled: goal.reminderEnabled ?? false,
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
    dto: {
      name: unknown
      targetAmount: unknown
      targetDate?: unknown
      accountId?: unknown
      reminderAmount?: unknown
      reminderEnabled?: unknown
    } & ReminderInput
  ) {
    const accountId = await resolveSavingsAccount(userId, dto.accountId)
    const reminderEnabled = validateReminderEnabled(dto.reminderEnabled)

    if (reminderEnabled && !accountId) {
      throw new BadRequestError('El recordatorio de la meta requiere una cuenta de ahorro')
    }

    const reminderAmount = validateReminderAmount(dto.reminderAmount)
    const settings = resolveReminderSettings(dto, reminderEnabled)

    const goal = await GoalRepository.create(userId, {
      name: normalizeName(dto.name),
      targetAmount: validateTargetAmount(dto.targetAmount),
      targetDate: parseTargetDate(dto.targetDate),
      accountId,
      ...settings,
      reminderAmount,
      reminderEnabled,
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
      reminderAmount?: unknown
      reminderEnabled?: unknown
    } & ReminderInput
  ) {
    const existing = await GoalRepository.findById(userId, id)

    if (!existing) {
      throw new NotFoundError('Goal')
    }

    const reminderEnabled =
      dto.reminderEnabled === undefined
        ? (existing.reminderEnabled ?? false)
        : validateReminderEnabled(dto.reminderEnabled)

    if (reminderEnabled) {
      const accountId = dto.accountId === undefined
        ? existing.accountId
        : await resolveSavingsAccount(userId, dto.accountId)
      if (!accountId) {
        throw new BadRequestError('El recordatorio de la meta requiere una cuenta de ahorro')
      }
    }
    // El importe sugerido es opcional incluso con el aviso encendido.

    const data: Parameters<typeof GoalRepository.update>[2] = {}

    if (dto.name !== undefined) data.name = normalizeName(dto.name)
    if (dto.targetAmount !== undefined) data.targetAmount = validateTargetAmount(dto.targetAmount)
    if (dto.targetDate !== undefined) data.targetDate = parseTargetDate(dto.targetDate)
    if (dto.accountId !== undefined) {
      data.accountId = await resolveSavingsAccount(userId, dto.accountId)
    }
    if (dto.isArchived !== undefined) data.isArchived = dto.isArchived === true
    if (hasScheduleChanges(dto)) {
      Object.assign(data, resolveReminderSettings(dto, reminderEnabled, settingsFromGoal(existing)))
    }
    if (dto.reminderAmount !== undefined) {
      data.reminderAmount = validateReminderAmount(dto.reminderAmount)
    }
    if (dto.reminderEnabled !== undefined) {
      data.reminderEnabled = reminderEnabled
    }

    const goal = await GoalRepository.update(userId, id, data)

    if (!goal) {
      throw new NotFoundError('Goal')
    }

    if (hasScheduleChanges(dto) || (existing.reminderEnabled && !reminderEnabled)) {
      await GoalRepository.cancelPendingReminder(userId, id)
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
