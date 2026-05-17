export function normalizeDescription(desc: string) {
  return desc.toUpperCase().trim()
}

const INCOME_PREFIXES = [
  'BIZUM DE ',
  'TRANSFERENCIA DE ',
  'PAGO CON ',
  'INGRESO POR ',
  'RECIBO DE ',
]

export function normalizeIncomeDescription(desc: string): string {
  let normalized = desc.toUpperCase().trim()
  for (const prefix of INCOME_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length).trim()
    }
  }
  normalized = normalized.replace(/[\d,.\s]+/g, ' ').trim()
  if (!normalized) {
    return desc.toUpperCase().trim()
  }
  return normalized
}