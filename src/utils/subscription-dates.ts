/** Avanza una fecha según la frecuencia de una suscripción. */
export function addFrequency(date: Date, frequency: string): Date {
  const next = new Date(date)
  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7)
      break
    case 'biweekly':
      next.setDate(next.getDate() + 14)
      break
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      break
    case 'bimonthly':
      next.setMonth(next.getMonth() + 2)
      break
    case 'quarterly':
      next.setMonth(next.getMonth() + 3)
      break
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1)
      break
    default:
      return next
  }
  return next
}

/**
 * Próxima fecha de cobro a partir del último cobro conocido. Si el último
 * cobro es antiguo, avanza las veces necesarias hasta llegar a hoy o después.
 */
export function nextChargeDate(
  lastChargeDate: Date | null,
  frequency: string,
  reference: Date = new Date()
): Date | null {
  if (!lastChargeDate) return null

  const today = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate())
  let next = addFrequency(new Date(lastChargeDate), frequency)
  let iterations = 0

  while (next < today && iterations < 120) {
    const advanced = addFrequency(next, frequency)
    if (advanced.getTime() === next.getTime()) return next
    next = advanced
    iterations++
  }

  return next
}
