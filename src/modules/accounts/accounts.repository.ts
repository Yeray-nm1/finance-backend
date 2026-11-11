import { prisma } from '../../core/db'

export type CreateAccountDTO = {
  name: string
  type: string
}

export const AccountRepository = {
  async findAll(userId: string) {
    return prisma.account.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
  },

  async findById(userId: string, id: string) {
    return prisma.account.findFirst({ where: { id, userId } })
  },

  async findFirst(userId: string) {
    return prisma.account.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    })
  },

  async detachTransactions(userId: string, accountId: string) {
    return prisma.$transaction([
      prisma.transaction.updateMany({
        where: { userId, accountId },
        data: { accountId: null },
      }),
      prisma.transaction.updateMany({
        where: { userId, transferAccountId: accountId },
        data: { transferAccountId: null },
      }),
    ])
  },

  async create(userId: string, dto: CreateAccountDTO) {
    return prisma.account.create({
      data: {
        userId,
        name: dto.name,
        type: dto.type,
      },
    })
  },

  async update(userId: string, id: string, dto: Partial<CreateAccountDTO>) {
    return prisma.account.update({
      where: { id, userId },
      data: dto,
    })
  },

  async delete(userId: string, id: string) {
    return prisma.account.delete({
      where: { id, userId },
    })
  },
}
