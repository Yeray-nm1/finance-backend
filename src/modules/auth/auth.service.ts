import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { config } from '../../config/env'
import { UserRepository, RegisterDTO, LoginDTO } from './auth.repository'
import { ConflictError, BadRequestError } from '../../core/errors'

const SALT_ROUNDS = 10
const DEFAULT_SESSION_MS = 7 * 24 * 60 * 60 * 1000

function createSession(userId: string) {
  const token = jwt.sign({ userId }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions)

  const decoded = jwt.decode(token) as { exp?: number } | null
  const expiresAt = decoded?.exp
    ? new Date(decoded.exp * 1000).toISOString()
    : new Date(Date.now() + DEFAULT_SESSION_MS).toISOString()

  return { token, expiresAt }
}

export const AuthService = {
  async register(dto: RegisterDTO) {
    const existing = await UserRepository.findByEmail(dto.email)

    if (existing) {
      throw new ConflictError('Email already registered')
    }

    const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS)

    const user = await UserRepository.create(dto.email, hashedPassword)
    const session = createSession(user.id)

    return {
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
      ...session,
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

    const session = createSession(user.id)

    return {
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
      ...session,
    }
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await UserRepository.findById(userId)

    if (!user) {
      throw new BadRequestError('User not found')
    }

    const validPassword = await bcrypt.compare(currentPassword, user.password)

    if (!validPassword) {
      throw new BadRequestError('La contraseña actual no es correcta')
    }

    if (currentPassword === newPassword) {
      throw new BadRequestError('La nueva contraseña debe ser distinta a la actual')
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS)
    await UserRepository.updatePassword(user.id, hashedPassword)
  },

  async me(userId: string) {
    const user = await UserRepository.findById(userId)

    if (!user) {
      throw new BadRequestError('User not found')
    }

    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
    }
  },
}
