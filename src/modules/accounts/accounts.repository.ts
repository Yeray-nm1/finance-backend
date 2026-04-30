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
