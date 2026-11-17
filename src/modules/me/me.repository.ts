import { prisma } from '../../core/db'
import type { Prisma } from '@prisma/client'

// El orden importa: primero lo que referencia a otras tablas y después
// aquello de lo que dependen, para no chocar con las claves foráneas.
async function deleteUserData(tx: Prisma.TransactionClient, userId: string) {
  await tx.notification.deleteMany({ where: { userId } })
  await tx.notificationRule.deleteMany({ where: { userId } })
  await tx.priceChange.deleteMany({ where: { userId } })
  await tx.subscriptionConflict.deleteMany({ where: { userId } })
  await tx.transaction.deleteMany({ where: { userId } })
  await tx.budget.deleteMany({ where: { userId } })
  await tx.savingsGoal.deleteMany({ where: { userId } })
  await tx.subscription.deleteMany({ where: { userId } })
  await tx.monthlyBudget.deleteMany({ where: { userId } })
  await tx.account.deleteMany({ where: { userId } })
  await tx.category.deleteMany({ where: { userId } })
}

export const MeRepository = {
  async deleteAllData(userId: string) {
    return prisma.$transaction((tx) => deleteUserData(tx, userId))
  },

  async deleteAccount(userId: string) {
    return prisma.$transaction(async (tx) => {
      await deleteUserData(tx, userId)
      await tx.user.delete({ where: { id: userId } })
    })
  },
}
