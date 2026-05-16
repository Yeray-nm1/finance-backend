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

export const AuthController = {
  async register(req: Request, res: Response) {
    const email = requireField<string>(req.body, 'email')
    const password = requireField<string>(req.body, 'password')

    validatePassword(password)

    const result = await AuthService.register({ email, password })

    res.cookie('finance_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    res.status(201).json({ user: result.user })
  },

  async login(req: Request, res: Response) {
    const email = requireField<string>(req.body, 'email')
    const password = requireField<string>(req.body, 'password')

    const result = await AuthService.login({ email, password })

    res.cookie('finance_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    res.json({ user: result.user })
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
