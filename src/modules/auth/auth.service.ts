import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { config } from '../../config/env'
import { UserRepository, RegisterDTO, LoginDTO } from './auth.repository'
import { ConflictError, BadRequestError } from '../../core/errors'

const SALT_ROUNDS = 10

export const AuthService = {
  async register(dto: RegisterDTO) {
    const existing = await UserRepository.findByEmail(dto.email)

    if (existing) {
      throw new ConflictError('Email already registered')
    }

    const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS)

    const user = await UserRepository.create(dto.email, hashedPassword)

    const token = jwt.sign({ userId: user.id }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    } as jwt.SignOptions)

    return {
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
      token,
    }
  },

  async login(dto: LoginDTO) {
    const user = await UserRepository.findByEmail(dto.email)

    if (!user) {
      throw new BadRequestError('Invalid credentials')
    }

    const validPassword = await bcrypt.compare(dto.password, user.password)

    if (!validPassword) {
      throw new BadRequestError('Invalid credentials')
    }

    const token = jwt.sign({ userId: user.id }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    } as jwt.SignOptions)

    return {
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
      token,
    }
  },
}
