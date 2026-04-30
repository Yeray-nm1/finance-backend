import { prisma } from '../../core/db'

export type CategoryType = 'needs' | 'leisure' | 'savings' | 'other'

export type CreateCategoryDTO = {
  name: string
  type: CategoryType
}

export const CategoryRepository = {
  async findAll(userId: string) {
    return prisma.category.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    })
  },

  async findById(userId: string, id: string) {
    return prisma.category.findFirst({ where: { id, userId } })
  },

  async create(userId: string, dto: CreateCategoryDTO) {
    return prisma.category.create({
      data: {
        userId,
        name: dto.name,
        type: dto.type,
      },
    })
  },

  async update(userId: string, id: string, dto: Partial<CreateCategoryDTO>) {
    return prisma.category.update({
      where: { id, userId },
      data: dto,
    })
  },

  async delete(userId: string, id: string) {
    return prisma.category.delete({
      where: { id, userId },
    })
  },
}
