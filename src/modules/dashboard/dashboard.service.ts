import { prisma } from '../../core/db'
import { Transaction, Budget, Subscription, CategoryType } from '@prisma/client'
import { normalizeDescription } from '../../utils/normalize'

const TYPE_LABELS: Record<string, string> = {
  needs: 'Necesidades',
  leisure: 'Ocio',
  savings: 'Ahorro',
  other: 'Otros',
}

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
  async getAvailableMonths(userId: string) {
    const [txMonths, budgetMonths] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId },
        select: { date: true },
      }),
      prisma.monthlyBudget.findMany({
        where: { userId },
        select: { year: true, month: true },
      }),
    ])

    const seen = new Set<string>()

    for (const t of txMonths) {
      seen.add(`${t.date.getFullYear()}-${t.date.getMonth() + 1}`)
    }
    for (const b of budgetMonths) {
      seen.add(`${b.year}-${b.month}`)
    }

    return Array.from(seen)
      .map((k) => {
        const [y, m] = k.split('-').map(Number)
        return { year: y, month: m }
      })
      .sort((a, b) => a.year - b.year || a.month - b.month)
  },


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

    const monthlyBudget = await prisma.monthlyBudget.findUnique({
      where: { userId_month_year: { userId, month, year } },
    })

    if (monthlyBudget) {
      const allocations = monthlyBudget.typeAllocations as Array<{ type: CategoryType; percentage: number }>

      const categories = await prisma.category.findMany({ where: { userId } })
      const categoriesByType: Record<string, Array<{ id: string; name: string }>> = {}
      for (const cat of categories) {
        if (!categoriesByType[cat.type]) categoriesByType[cat.type] = []
        categoriesByType[cat.type].push({ id: cat.id, name: cat.name })
      }

      const expenseTx = await prisma.transaction.findMany({
        where: { userId, type: 'expense', date: { gte: start, lt: end }, categoryId: { not: null } },
        select: { categoryId: true, amount: true },
      })

      const spentByCategory: Record<string, number> = {}
      for (const tx of expenseTx) {
        if (tx.categoryId) {
          spentByCategory[tx.categoryId] = (spentByCategory[tx.categoryId] ?? 0) + Math.abs(tx.amount)
        }
      }

      return allocations.flatMap((a) => {
        const budgeted = monthlyBudget.totalIncome * (a.percentage / 100)
        const typeCats = categoriesByType[a.type] ?? []

        if (typeCats.length === 0) {
          const spent = 0
          const progress = 0
          return [{
            category: TYPE_LABELS[a.type] ?? a.type,
            categoryType: a.type,
            percentage: a.percentage,
            spent: round2(spent),
            budgeted: round2(budgeted),
            progress: round2(progress),
            status: 'ok' as const,
          }]
        }

        return typeCats.map((cat) => {
          const spent = spentByCategory[cat.id] ?? 0
          const progress = budgeted > 0 ? (spent / budgeted) * 100 : 0
          const status = progress > 100 ? 'over' : progress > 80 ? 'warning' : 'ok'

          return {
            category: cat.name,
            categoryType: a.type,
            percentage: a.percentage,
            spent: round2(spent),
            budgeted: round2(budgeted),
            progress: round2(progress),
            status,
          }
        })
      })
    }

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
        categoryType: b.category.type,
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
    const amountDiff = currentBalance.balance - previousBalance.balance
    return { percentage: round2(change), amountDiff: round2(amountDiff) }
  },

  async getRecurring(userId: string, year?: number, month?: number) {
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

    const now = year !== undefined && month !== undefined
      ? new Date(year, month - 1, 1)
      : new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const manual = await Promise.all(
      subscriptions.map(async (s) => {
        let lastTx = await prisma.transaction.findFirst({
          where: { userId, subscriptionId: s.id },
          orderBy: { date: 'desc' },
          select: { date: true },
        })

        if (!lastTx) {
          const normalizedName = normalizeDescription(s.name)
          lastTx = await prisma.transaction.findFirst({
            where: { userId, description: { contains: normalizedName, mode: 'insensitive' } },
            orderBy: { date: 'desc' },
            select: { date: true },
          })
        }

        const isPaid = lastTx && lastTx.date >= monthStart && lastTx.date < monthEnd
        const status = isPaid ? 'paid' : 'pending'
        const lastChargeDate = lastTx ? lastTx.date.toISOString() : null

        let nextChargeDate: string | null = null
        if (lastTx) {
          const d = new Date(lastTx.date)
          switch (s.frequency) {
            case 'weekly':
              d.setDate(d.getDate() + 7)
              break
            case 'biweekly':
              d.setDate(d.getDate() + 14)
              break
            case 'monthly':
              d.setMonth(d.getMonth() + 1)
              break
            case 'bimonthly':
              d.setMonth(d.getMonth() + 2)
              break
            case 'quarterly':
              d.setMonth(d.getMonth() + 3)
              break
            case 'yearly':
              d.setFullYear(d.getFullYear() + 1)
              break
          }
          nextChargeDate = d.toISOString()
        }

        return {
          name: s.name,
          amount: s.amount,
          frequency: s.frequency,
          status,
          lastChargeDate,
          nextChargeDate,
        }
      }),
    )

    return {
      manual,
      detected,
    }
  },

  async getRecentTransactions(userId: string, year?: number, month?: number, limit = 10) {
    const where: { userId: string; date?: { gte: Date; lt: Date } } = { userId }
    if (year !== undefined && month !== undefined) {
      const start = new Date(year, month - 1, 1)
      const end = new Date(year, month, 1)
      where.date = { gte: start, lt: end }
    }
    const transactions = await prisma.transaction.findMany({
      where,
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
      DashboardService.getRecurring(userId, year, month),
      DashboardService.getRecentTransactions(userId, year, month),
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
