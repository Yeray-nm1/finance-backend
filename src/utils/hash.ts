import { createHash } from 'crypto'

export function createTransactionHash(date: string, amount: number, description: string): string {
  const raw = `${date}-${amount}-${description}`
  return createHash('sha256').update(raw).digest('hex')
}
