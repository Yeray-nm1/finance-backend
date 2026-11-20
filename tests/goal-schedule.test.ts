import { describe, expect, it } from 'vitest'
import {
  currentPeriod,
  isOccurrence,
  periodForOccurrence,
  recipientNameFor,
} from '../src/utils/goal-schedule'

const at = (date: string) => new Date(`${date}T12:00:00.000Z`)

describe('recipientNameFor', () => {
  it('CA-4 usa el nombre recortado cuando existe', () => {
    expect(recipientNameFor({ name: '  Ana  ', email: 'otro@example.com' })).toBe('Ana')
  })

  it('CA-4 usa la parte local del email como fallback', () => {
    expect(recipientNameFor({ name: null, email: 'ana.perez@example.com' })).toBe('ana.perez')
    expect(recipientNameFor({ name: '   ', email: 'demo@example.com' })).toBe('demo')
  })
})

describe('periodForOccurrence', () => {
  it('CA-14 prefija el periodo según la frecuencia', () => {
    expect(periodForOccurrence('WEEKLY', at('2026-11-20'))).toBe('W:2026-11-20')
    expect(periodForOccurrence('MONTHLY', at('2026-11-18'))).toBe('M:2026-11')
    expect(periodForOccurrence('CUSTOM', at('2026-11-25'))).toBe('C:2026-11-25')
  })
})

describe('isOccurrence', () => {
  it('CA-10 semanal compara el día de la semana (1 = lunes … 7 = domingo)', () => {
    const friday = { reminderFrequency: 'WEEKLY' as const, reminderWeekday: 5 }

    expect(isOccurrence(friday, at('2026-11-20'))).toBe(true)
    expect(isOccurrence(friday, at('2026-11-18'))).toBe(false)
  })

  it('CA-10 mensual acepta días del 1 al 31', () => {
    const monthly = { reminderFrequency: 'MONTHLY' as const, reminderDay: 31 }

    expect(isOccurrence(monthly, at('2026-11-30'))).toBe(false)
    expect(isOccurrence(monthly, at('2026-11-01'))).toBe(false)
    expect(isOccurrence({ ...monthly, reminderDay: 15 }, at('2026-11-15'))).toBe(true)
  })

  it('CA-11 el último día del mes respeta febrero y bisiestos', () => {
    const lastDay = {
      reminderFrequency: 'MONTHLY' as const,
      reminderDay: null,
      reminderLastDay: true,
    }

    expect(isOccurrence(lastDay, at('2026-11-30'))).toBe(true)
    expect(isOccurrence(lastDay, at('2026-11-29'))).toBe(false)
    expect(isOccurrence(lastDay, at('2026-02-28'))).toBe(true)
    expect(isOccurrence(lastDay, at('2024-02-29'))).toBe(true)
    expect(isOccurrence(lastDay, at('2028-02-29'))).toBe(true)
  })

  it('CA-11 personalizada en días desde la fecha de inicio', () => {
    const everyTwoDays = {
      reminderFrequency: 'CUSTOM' as const,
      reminderInterval: 2,
      reminderIntervalUnit: 'DAYS' as const,
      reminderStartDate: at('2026-11-23'),
    }

    expect(isOccurrence(everyTwoDays, at('2026-11-22'))).toBe(false)
    expect(isOccurrence(everyTwoDays, at('2026-11-23'))).toBe(true)
    expect(isOccurrence(everyTwoDays, at('2026-11-24'))).toBe(false)
    expect(isOccurrence(everyTwoDays, at('2026-11-25'))).toBe(true)
  })

  it('CA-11 personalizada en semanas conserva el día de la semana', () => {
    const everyTwoWeeks = {
      reminderFrequency: 'CUSTOM' as const,
      reminderInterval: 2,
      reminderIntervalUnit: 'WEEKS' as const,
      reminderStartDate: at('2026-11-20'),
    }

    expect(isOccurrence(everyTwoWeeks, at('2026-11-27'))).toBe(false)
    expect(isOccurrence(everyTwoWeeks, at('2026-12-04'))).toBe(true)
    expect(isOccurrence(everyTwoWeeks, at('2026-12-18'))).toBe(true)
  })

  it('CA-11 personalizada en meses hace clamp al último día', () => {
    const monthlyStart = {
      reminderFrequency: 'CUSTOM' as const,
      reminderInterval: 1,
      reminderIntervalUnit: 'MONTHS' as const,
      reminderStartDate: at('2026-01-31'),
    }

    expect(isOccurrence(monthlyStart, at('2026-02-27'))).toBe(false)
    expect(isOccurrence(monthlyStart, at('2026-02-28'))).toBe(true)
    expect(isOccurrence(monthlyStart, at('2026-03-31'))).toBe(true)

    const everyTwoMonths = { ...monthlyStart, reminderInterval: 2 }
    expect(isOccurrence(everyTwoMonths, at('2026-02-28'))).toBe(false)
    expect(isOccurrence(everyTwoMonths, at('2026-03-31'))).toBe(true)
  })

  it('CA-10 una configuración incompleta no genera ocurrencias', () => {
    expect(isOccurrence({ reminderFrequency: 'WEEKLY' }, at('2026-11-20'))).toBe(false)
    expect(isOccurrence({ reminderFrequency: 'MONTHLY' }, at('2026-11-20'))).toBe(false)
    expect(isOccurrence({ reminderFrequency: 'CUSTOM' }, at('2026-11-20'))).toBe(false)
  })
})

describe('currentPeriod', () => {
  it('CA-16 mensual mantiene el enlace hasta el siguiente mes', () => {
    const monthly = { reminderFrequency: 'MONTHLY' as const, reminderDay: 18 }

    expect(currentPeriod(monthly, at('2026-11-18'))).toBe('M:2026-11')
    expect(currentPeriod(monthly, at('2026-11-30'))).toBe('M:2026-11')
    expect(currentPeriod(monthly, at('2026-12-01'))).toBe('M:2026-11')
    expect(currentPeriod(monthly, at('2026-12-18'))).toBe('M:2026-12')
  })

  it('CA-16 el último día del mes solo es vigente desde el último día', () => {
    const lastDay = {
      reminderFrequency: 'MONTHLY' as const,
      reminderLastDay: true,
      reminderDay: null,
    }

    expect(currentPeriod(lastDay, at('2026-11-18'))).toBe('M:2026-10')
    expect(currentPeriod(lastDay, at('2026-11-30'))).toBe('M:2026-11')
  })

  it('CA-16 semanal y personalizada usan la última ocurrencia', () => {
    expect(
      currentPeriod({ reminderFrequency: 'WEEKLY', reminderWeekday: 5 }, at('2026-11-18'))
    ).toBe('W:2026-11-13')

    expect(
      currentPeriod(
        {
          reminderFrequency: 'CUSTOM',
          reminderInterval: 2,
          reminderIntervalUnit: 'DAYS',
          reminderStartDate: at('2026-11-23'),
        },
        at('2026-11-26')
      )
    ).toBe('C:2026-11-25')
  })

  it('CA-16 una meta sin configuración válida no tiene periodo actual', () => {
    expect(currentPeriod({ reminderFrequency: 'CUSTOM' }, at('2026-11-26'))).toBeNull()
  })
})
