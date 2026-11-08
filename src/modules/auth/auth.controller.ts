import { Request, Response } from 'express'
import { AuthService } from './auth.service'
import { requireField } from '../../middlewares/validate.middleware'
import { BadRequestError } from '../../core/errors'

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/

function validatePassword(password: string): void {
  if (!PASSWORD_REGEX.test(password)) {
    throw new BadRequestError(
      'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un dígito.'
    )
  }
}

function setSessionCookie(res: Response, token: string, expiresAt: string): void {
  res.cookie('finance_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    expires: new Date(expiresAt),
  })
}

export const AuthController = {
  async register(req: Request, res: Response) {
    const email = requireField<string>(req.body, 'email')
    const password = requireField<string>(req.body, 'password')

    validatePassword(password)

    const result = await AuthService.register({ email, password })

    setSessionCookie(res, result.token, result.expiresAt)

    res.status(201).json({ user: result.user })
  },

  async login(req: Request, res: Response) {
    const email = requireField<string>(req.body, 'email')
    const password = requireField<string>(req.body, 'password')

    const result = await AuthService.login({ email, password })

    setSessionCookie(res, result.token, result.expiresAt)

    res.json({ user: result.user })
  },

  async changePassword(req: Request, res: Response) {
    const currentPassword = requireField<string>(req.body, 'currentPassword')
    const newPassword = requireField<string>(req.body, 'newPassword')

    validatePassword(newPassword)

    await AuthService.changePassword(req.userId, currentPassword, newPassword)

    res.status(204).send()
  },

  async me(req: Request, res: Response) {
    const userId = req.userId
    const user = await AuthService.me(userId)
    res.json({ user })
  },

  async logout(_req: Request, res: Response) {
    res.clearCookie('finance_token')
    res.json({ message: 'Logged out' })
  },
}
