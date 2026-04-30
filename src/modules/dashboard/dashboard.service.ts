import { prisma } from '../../core/db'
import { normalizeDescription } from '../../utils/normalize'

type SubscriptionFrequency = 'weekly' | 'monthly' | 'yearly'

function detectFrequencyName(avgDays: number): SubscriptionFrequency | null {
  if (avgDays >= 4 && avgDays <= 10) return 'weekly'
  if (avgDays >= 25 && avgDays <= 35) return 'monthly'
  if (avgDays >= 350 && avgDays <= 380) return 'yearly'
  return null
}

export const DashboardService = {
  async getMonthOverview(userId: string, year: number, month: number) {
    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 1)

    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        date: {
          gte: start,
          lt: end,
        },
      },
      include: {
        category: true,
      },
    })

    const income = transactions
      .filter((t: any) => t.type === 'income')
      .reduce((sum: number, t: any) => sum + t.amount, 0)

    const expenses = transactions
      .filter((t: any) => t.type === 'expense')
      .reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0)

    const savings = transactions
      .filter((t: any) => t.type === 'transfer')
      .reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0)

    const available = income - expenses - savings
    const balance = income - expenses

    return {
      income: Math.round(income * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
      savings: Math.round(savings * 100) / 100,
      available: Math.round(available * 100) / 100,
      balance: Math.round(balance * 100) / 100,
    }
  },

  async getBudgetDeviations(userId: string, year: number, month: number) {
    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 1)

    const budgets = await prisma.budget.findMany({
      where: { userId },
      include: { category: true },
    })

    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        type: 'expense',
        date: { gte: start, lt: end },
      },
    })

    const spendingByCategory: Record<string, number> = {}

    for (const tx of transactions) {
      if (tx.categoryId) {
        spendingByCategory[tx.categoryId] = (spendingByCategory[tx.categoryId] || 0) + Math.abs(tx.amount)
      }
    }

    const deviations = budgets.map((budget: any) => {
      const spent = spendingByCategory[budget.categoryId] || 0
      const budgetAmount = (budget.percentage / 100) *
        transactions.reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0)
      const progress = budgetAmount > 0 ? (spent / budgetAmount) * 100 : 0

      return {
        category: budget.category.name,
        percentage: budget.percentage,
        spent: Math.round(spent * 100) / 100,
        budgeted: Math.round(budgetAmount * 100) / 100,
        progress: Math.round(progress * 100) / 100,
        status: progress > 100 ? 'over' : progress > 80 ? 'warning' : 'ok',
      }
    })

    return deviations
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

      const existingManual = subscriptions.find((s: any) => normalizeDescription(s.name) === name)

      if (existingManual) continue

      detected.push({
        name,
        amount: Math.round(avgAmount * 100) / 100,
        frequency: freq,
        status: isVariable ? 'variable' : 'stable',
      })
    }

    return {
      manual: subscriptions.filter((s: any) => s.source === 'manual').map((s: any) => ({
        name: s.name,
        amount: s.amount,
        frequency: s.frequency,
        status: 'paid',
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

    return transactions.map((t: any) => ({
      id: t.id,
      date: t.date,
      amount: t.amount,
      description: t.description,
      type: t.type,
      category: t.category?.name || null,
      account: t.account?.name || null,
    }))
  },

  async getDashboard(userId: string, year: number, month: number) {
    const [balance, budgets, recurring, transactions] = await Promise.all([
      DashboardService.getMonthOverview(userId, year, month),
      DashboardService.getBudgetDeviations(userId, year, month),
      DashboardService.getRecurring(userId),
      DashboardService.getRecentTransactions(userId),
    ])

    return {
      balance,
      budgets,
      recurring,
      transactions,
    }
  },
}
