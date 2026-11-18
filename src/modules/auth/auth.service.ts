import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { config } from '../../config/env'
import { UserRepository, RegisterDTO, LoginDTO } from './auth.repository'
import { ConflictError, BadRequestError } from '../../core/errors'
import { FINANCE_FROM_NAME, NotificationSender, notificationSender } from '../notifications/notification-sender'
import { logger } from '../../core/logger'
import {
  decodeResetToken,
  passwordFingerprint,
  resetTokenIdempotencyKey,
  signResetToken,
} from './reset-token'

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

  async requestPasswordReset(email: string, sender: NotificationSender = notificationSender) {
    const user = await UserRepository.findByEmail(email)

    // No revelamos si el email está registrado: siempre responde lo mismo.
    if (!user) return

    const token = signResetToken(user.id, user.password)
    const resetUrl = `${config.frontendUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`

    try {
      await sender.send({
        to: user.email,
        fromName: FINANCE_FROM_NAME,
        template: 'password_reset',
        data: { resetUrl },
        idempotencyKey: resetTokenIdempotencyKey(token),
      })
    } catch (error) {
      // La petición sigue fallando en la API (error visible), pero el log indica
      // si el problema es configuración, credenciales del micro o caída del micro.
      logger.error('No se pudo enviar el correo de restablecimiento', {
        userId: user.id,
        error,
      })
      throw error
    }
  },

  async resetPassword(token: string, newPassword: string) {
    const payload = decodeResetToken(token)
    const user = await UserRepository.findById(payload.sub)

    if (!user || payload.pwd !== passwordFingerprint(user.password)) {
      throw new BadRequestError('Enlace de restablecimiento no válido o caducado')
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
