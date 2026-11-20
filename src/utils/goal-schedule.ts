/**
 * Cálculo de ocurrencias y periodos de los avisos de meta. Funciones puras:
 * reciben la configuración de la meta y fechas UTC, sin acceder a la BD.
 */

export type GoalReminderFrequency = 'WEEKLY' | 'MONTHLY' | 'CUSTOM'
export type GoalReminderIntervalUnit = 'DAYS' | 'WEEKS' | 'MONTHS'

export interface GoalScheduleConfig {
  reminderFrequency?: GoalReminderFrequency | string | null
  reminderDay?: number | null
  reminderWeekday?: number | null
  reminderLastDay?: boolean | null
  reminderInterval?: number | null
  reminderIntervalUnit?: GoalReminderIntervalUnit | string | null
  reminderStartDate?: Date | string | null
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
/** Suficiente para cualquier intervalo razonable en días, semanas o meses. */
const LOOKBACK_DAYS = 1200

function toDate(value: Date | string): Date {
  return typeof value === 'string' ? new Date(value) : value
}

function utcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

function isLastDayOfMonth(day: Date): boolean {
  return day.getUTCDate() === daysInMonth(day.getUTCFullYear(), day.getUTCMonth())
}

/** Lunes = 1 … domingo = 7. */
function weekday(day: Date): number {
  return ((day.getUTCDay() + 6) % 7) + 1
}

function frequencyOf(goal: GoalScheduleConfig): GoalReminderFrequency {
  if (goal.reminderFrequency === 'WEEKLY' || goal.reminderFrequency === 'CUSTOM') {
    return goal.reminderFrequency
  }
  return 'MONTHLY'
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Prefijo de frecuencia + fecha de la ocurrencia (o mes, en la mensual). */
export function periodForOccurrence(
  frequency: GoalReminderFrequency,
  occurrence: Date
): string {
  const year = occurrence.getUTCFullYear()
  const month = pad(occurrence.getUTCMonth() + 1)
  const day = pad(occurrence.getUTCDate())

  if (frequency === 'MONTHLY') return `M:${year}-${month}`
  if (frequency === 'WEEKLY') return `W:${year}-${month}-${day}`
  return `C:${year}-${month}-${day}`
}

/** ¿Es `date` una fecha de aviso según la configuración de la meta? */
export function isOccurrence(goal: GoalScheduleConfig, date: Date): boolean {
  const frequency = frequencyOf(goal)
  const day = utcDay(date)

  if (frequency === 'WEEKLY') {
    return goal.reminderWeekday != null && weekday(day) === goal.reminderWeekday
  }

  if (frequency === 'MONTHLY') {
    if (goal.reminderLastDay) return isLastDayOfMonth(day)
    const reminderDay = goal.reminderDay
    return (
      reminderDay != null &&
      reminderDay >= 1 &&
      reminderDay <= 31 &&
      day.getUTCDate() === reminderDay
    )
  }

  const start = goal.reminderStartDate ? utcDay(toDate(goal.reminderStartDate)) : null
  const interval = goal.reminderInterval
  const unit = goal.reminderIntervalUnit

  if (!start || !interval || interval < 1 || !unit || day.getTime() < start.getTime()) {
    return false
  }

  if (unit === 'DAYS') {
    return Math.round((day.getTime() - start.getTime()) / MS_PER_DAY) % interval === 0
  }

  if (unit === 'WEEKS') {
    if (weekday(day) !== weekday(start)) return false
    return Math.round((day.getTime() - start.getTime()) / MS_PER_DAY) % (7 * interval) === 0
  }

  if (unit === 'MONTHS') {
    const months =
      (day.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (day.getUTCMonth() - start.getUTCMonth())
    if (months < 0 || months % interval !== 0) return false
    const expected = Math.min(
      start.getUTCDate(),
      daysInMonth(day.getUTCFullYear(), day.getUTCMonth())
    )
    return day.getUTCDate() === expected
  }

  return false
}

/**
 * Periodo de la última ocurrencia igual o anterior a `now`. Así un enlace
 * sigue siendo válido hasta el siguiente aviso, no solo el día del envío.
 */
export function currentPeriod(goal: GoalScheduleConfig, now: Date): string | null {
  const base = utcDay(now)
  const frequency = frequencyOf(goal)

  for (let offset = 0; offset < LOOKBACK_DAYS; offset += 1) {
    const candidate = new Date(base.getTime() - offset * MS_PER_DAY)
    if (isOccurrence(goal, candidate)) {
      return periodForOccurrence(frequency, candidate)
    }
  }

  return null
}

/** Nombre visible del destinatario; fallback a la parte local del email. */
export function recipientNameFor(user: { name?: string | null; email: string }): string {
  const name = typeof user.name === 'string' ? user.name.trim() : ''
  return name || user.email.split('@')[0]
}
