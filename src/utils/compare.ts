import { normalizeDescription } from './normalize'

export function isSimilarName(a: string, b: string): boolean {
  if (!a || !b) return false
  const na = normalizeDescription(a)
  const nb = normalizeDescription(b)
  return (
    na === nb ||
    (na.length >= 3 && nb.includes(na)) ||
    (nb.length >= 3 && na.includes(nb))
  )
}
