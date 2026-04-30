// transactions.dto.ts
export type CreateTransactionDTO = {
  date: string
  amount: number
  description: string
  type: 'income' | 'expense' | 'transfer'
  accountId: string
  categoryId?: string
}