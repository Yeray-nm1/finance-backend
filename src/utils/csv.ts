import { parse } from 'csv-parse/sync'

export function parseCsv(buffer: Buffer) {
  return parse(buffer, {
    columns: true,
    skip_empty_lines: true
  })
}

export type CsvTransactionType = 'income' | 'expense' | 'transfer'

export type CsvField =
  | 'date'
  | 'amount'
  | 'description'
  | 'type'

const FIELD_ALIASES: Record<CsvField, string[]> = {
  date: ['date', 'fecha', 'fechavalor', 'fechaoperacion', 'fechacontable'],
  amount: ['amount', 'importe', 'cantidad', 'valor', 'importeeur'],
  description: ['description', 'descripcion', 'concepto', 'detalle', 'movimiento'],
  type: ['type', 'tipo', 'naturaleza', 'cargoabono', 'debehaber'],
}

const TYPE_ALIASES: Record<string, CsvTransactionType> = {
  income: 'income',
  ingreso: 'income',
  ingresos: 'income',
  abono: 'income',
  abonos: 'income',
  entrada: 'income',
  cobro: 'income',
  expense: 'expense',
  gasto: 'expense',
  gastos: 'expense',
  cargo: 'expense',
  cargos: 'expense',
  salida: 'expense',
  pago: 'expense',
  transfer: 'transfer',
  transferencia: 'transfer',
  traspaso: 'transfer',
}

export function normalizeCsvKey(key: string): string {
  return key
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export function normalizeCsvRow(row: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {}

  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) continue
    normalized[normalizeCsvKey(key)] = String(value)
  }

  return normalized
}

export function pickCsvField(row: Record<string, string>, field: CsvField): string | undefined {
  for (const alias of FIELD_ALIASES[field]) {
    const value = row[alias]
    if (value !== undefined && value.trim() !== '') {
      return value.trim()
    }
  }

  return undefined
}

export function parseCsvType(raw: unknown): CsvTransactionType | null {
  if (raw === null || raw === undefined) return null

  const normalized = normalizeCsvKey(String(raw))
  return TYPE_ALIASES[normalized] ?? null
}

/**
 * Acepta importes en formato español (`1.234,56`), internacional (`1,234.56`)
 * o sin separador de miles (`1234,56` / `1234.56`).
 */
export function parseCsvAmount(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null
  }

  if (raw === null || raw === undefined) return null

  let value = String(raw).trim()
  if (!value) return null

  let negative = false

  if (/^\(.*\)$/.test(value)) {
    negative = true
    value = value.slice(1, -1)
  }

  value = value.replace(/[^\d.,+\-]/g, '')
  if (!value || !/\d/.test(value)) return null

  if (value.endsWith('-') && !value.startsWith('-')) {
    negative = true
    value = value.slice(0, -1)
  }

  let sign = negative ? -1 : 1

  if (value.startsWith('-')) {
    sign *= -1
    value = value.slice(1)
  } else if (value.startsWith('+')) {
    value = value.slice(1)
  }

  if (value.includes('-') || value.includes('+')) return null

  const dotCount = (value.match(/\./g) ?? []).length
  const commaCount = (value.match(/,/g) ?? []).length

  let decimalSeparator: '.' | ',' | null = null

  if (dotCount > 0 && commaCount > 0) {
    decimalSeparator = value.lastIndexOf('.') > value.lastIndexOf(',') ? '.' : ','
  } else if (commaCount > 0) {
    const parts = value.split(',')
    const lastGroup = parts[parts.length - 1]

    decimalSeparator = commaCount > 1 && lastGroup.length === 3 ? null : ','
  } else if (dotCount > 0) {
    const parts = value.split('.')
    const lastGroup = parts[parts.length - 1]

    if (dotCount > 1) {
      decimalSeparator = lastGroup.length === 3 ? null : '.'
    } else {
      const firstGroup = parts[0]
      const looksLikeThousands =
        lastGroup.length === 3 && firstGroup !== '0' && firstGroup.length <= 3

      decimalSeparator = looksLikeThousands ? null : '.'
    }
  }

  let normalized: string

  if (decimalSeparator === ',') {
    normalized = value.replace(/\./g, '').replace(',', '.')
  } else if (decimalSeparator === '.') {
    normalized = value.replace(/,/g, '')
  } else {
    normalized = value.replace(/[.,]/g, '')
  }

  if ((normalized.match(/\./g) ?? []).length > 1) return null

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return null

  return parsed * sign
}

function buildDate(year: number, month: number, day: number): Date | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return date
}

function parseExcelSerial(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial <= 0) return null

  const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86400000))
  if (Number.isNaN(date.getTime())) return null

  return date
}

/**
 * Acepta ISO (`2026-01-31`), español (`31/01/2026`, `31-01-2026`)
 * y seriales de Excel. En formatos ambiguos se asume día primero.
 */
export function parseCsvDate(raw: unknown): Date | null {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw
  }

  if (typeof raw === 'number') {
    return parseExcelSerial(raw)
  }

  if (raw === null || raw === undefined) return null

  const value = String(raw).trim()
  if (!value) return null

  let match = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/)
  if (match) {
    return buildDate(Number(match[1]), Number(match[2]), Number(match[3]))
  }

  match = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[T\s].*)?$/)
  if (match) {
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])
    return buildDate(year, Number(match[2]), Number(match[1]))
  }

  match = value.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (match) {
    return buildDate(Number(match[1]), Number(match[2]), Number(match[3]))
  }

  match = value.match(/^(\d{5})$/)
  if (match) {
    return parseExcelSerial(Number(match[1]))
  }

  const fallback = new Date(value)
  if (Number.isNaN(fallback.getTime())) return null

  return buildDate(fallback.getFullYear(), fallback.getMonth() + 1, fallback.getDate())
}

export function formatCsvDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}
