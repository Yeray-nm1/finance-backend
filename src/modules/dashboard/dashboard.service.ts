import { prisma } from '../../core/db'
import { Transaction, Budget, Subscription } from '@prisma/client'
import { normalizeDescription } from '../../utils/normalize'

type SubscriptionFrequency = 'weekly' | 'monthly' | 'yearly'

function detectFrequencyName(avgDays: number): SubscriptionFrequency | null {
  if (avgDays >= 4 && avgDays <= 10) return 'weekly'
  if (avgDays >= 25 && avgDays <= 35) return 'monthly'
  if (avgDays >= 350 && avgDays <= 380) return 'yearly'
  return null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export const DashboardService = {
  async getMonthOverview(userId: string, year: number, month: number) {
    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 1)

    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        date: { gte: start, lt: end },
      },
      include: { category: true },
    })

    let income = 0
    let expenses = 0
    let savings = 0

    for (const t of transactions) {
      if (t.type === 'income') income += t.amount
      else if (t.type === 'expense') expenses += Math.abs(t.amount)
      else if (t.type === 'transfer') savings += Math.abs(t.amount)
    }

    const available = income - expenses - savings
    const balance = income - expenses

    return {
      income: round2(income),
      expenses: round2(expenses),
      savings: round2(savings),
      available: round2(available),
      balance: round2(balance),
    }
  },

  async getBudgetBudgets(userId: string, year: number, month: number) {
    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 1)

    const budgets = await prisma.budget.findMany({
      where: { userId, month, year },
      include: { category: true },
    })

    if (budgets.length === 0) return []

    const totalIncome = await prisma.transaction.aggregate({
      where: { userId, type: 'income', date: { gte: start, lt: end } },
      _sum: { amount: true },
    })

    const income = totalIncome._sum.amount ?? 0

    const expenseTx = await prisma.transaction.findMany({
      where: { userId, type: 'expense', date: { gte: start, lt: end } },
      select: { categoryId: true, amount: true },
    })

    const spentByCategory: Record<string, number> = {}
    for (const tx of expenseTx) {
      if (tx.categoryId) {
        spentByCategory[tx.categoryId] = (spentByCategory[tx.categoryId] ?? 0) + Math.abs(tx.amount)
      }
    }

    return budgets.map((b) => {
      const spent = spentByCategory[b.categoryId] ?? 0
      const budgeted = income * (b.percentage / 100)
      const progress = budgeted > 0 ? (spent / budgeted) * 100 : 0
      const status = progress > 100 ? 'over' : progress > 80 ? 'warning' : 'ok'

      return {
        category: b.category.name,
        percentage: b.percentage,
        spent: round2(spent),
        budgeted: round2(budgeted),
        progress: round2(progress),
        status,
      }
    })
  },

  async getVsPreviousMonth(userId: string, year: number, month: number) {
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year

    const currentBalance = await this.getMonthOverview(userId, year, month)
    const previousBalance = await this.getMonthOverview(userId, prevYear, prevMonth)

    if (previousBalance.balance === 0) return undefined

    const change = ((currentBalance.balance - previousBalance.balance) / Math.abs(previousBalance.balance)) * 100
    return round2(change)
  },

  async getRecurring(userId: string) {
    const subscriptions = await prisma.subscription.findMany({
      where: { userId },
      orderBy: { amount: 'desc' },
    })

    const groups = await prisma.transaction.findMany({
      where: { userId, type: 'expense' },
      orderBy: { date: 'desc' },
    })

    const grouped: Record<string, Array<{ date: Date; amount: number }>> = {}

    for (const tx of groups) {
      const normalized = normalizeDescription(tx.description)
      if (!grouped[normalized]) {
        grouped[normalized] = []
      }
      grouped[normalized].push({ date: tx.date, amount: tx.amount })
    }

    const detected: Array<{
      name: string
      amount: number
      frequency: string
      status: string
    }> = []

    for (const [name, txs] of Object.entries(grouped)) {
      if (txs.length < 2) continue

      const dates = txs.map((t) => t.date).sort((a, b) => a.getTime() - b.getTime())
      let totalDays = 0

      for (let i = 1; i < dates.length; i++) {
        totalDays += (dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60 * 24)
      }

      const avgDays = totalDays / (dates.length - 1)
      const freq = detectFrequencyName(avgDays)

      if (!freq) continue

      const amounts = txs.map((t) => Math.abs(t.amount))
      const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length
      const variance = amounts.reduce((sum, a) => sum + Math.pow(a - avgAmount, 2), 0) / amounts.length
      const isVariable = variance / (avgAmount * avgAmount) > 0.1

      const existingManual = subscriptions.find((s) => normalizeDescription(s.name) === name)
      if (existingManual) continue

      detected.push({
        name,
        amount: round2(avgAmount),
        frequency: freq,
        status: isVariable ? 'variable' : 'stable',
      })
    }

    return {
      manual: subscriptions.map((s) => ({
          name: s.name,
          amount: s.amount,
          frequency: s.frequency,
          status: 'paid' as const,
        })),
      detected,
    }
  },

  async getRecentTransactions(userId: string, limit = 20) {
    const transactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: limit,
      include: {
        category: true,
        account: true,
      },
    })

    return transactions.map((t) => ({
      id: t.id,
      date: t.date,
      amount: t.amount,
      description: t.description,
      type: t.type,
      category: t.category?.name ?? null,
      account: t.account?.name ?? null,
    }))
  },

  async getDashboard(userId: string, year: number, month: number) {
    const [balance, budgets, recurring, transactions, vsPreviousMonth] = await Promise.all([
      DashboardService.getMonthOverview(userId, year, month),
      DashboardService.getBudgetBudgets(userId, year, month),
      DashboardService.getRecurring(userId),
      DashboardService.getRecentTransactions(userId),
      DashboardService.getVsPreviousMonth(userId, year, month),
    ])

    return {
      balance: { ...balance, ...(vsPreviousMonth !== undefined ? { vsPreviousMonth } : {}) },
      budgets,
      recurring,
      transactions,
    }
  },
}
