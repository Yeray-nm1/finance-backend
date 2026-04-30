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
    return prisma.user.create({
      data: {
        email,
        password: hashedPassword,
      },
    })
  },

  async findById(id: string) {
    return prisma.user.findUnique({ where: { id } })
  },
}
