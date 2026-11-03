import { prisma } from '../../core/db'
import { NotFoundError, ConflictError, BadRequestError } from '../../core/errors'

export type RegisterDTO = {
  email: string
  password: string
}

export type LoginDTO = {
  email: string
  password: string
}

export const UserRepository = {
  async findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } })
  },

  async create(email: string, hashedPassword: string) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          accounts: {
            create: {
              name: 'Cuenta principal',
              type: 'checking',
            },
          },
        },
      })

      await tx.category.createMany({
        data: [
          { userId: user.id, name: 'Nómina', type: 'needs' },
          { userId: user.id, name: 'Hipoteca', type: 'needs' },
          { userId: user.id, name: 'Supermercado', type: 'needs' },
          { userId: user.id, name: 'Restaurante', type: 'leisure' },
          { userId: user.id, name: 'Ocio', type: 'leisure' },
          { userId: user.id, name: 'Ahorro', type: 'savings' },
        ],
      })

      return user
    })
  },

  async findById(id: string) {
    return prisma.user.findUnique({ where: { id } })
  },
}
