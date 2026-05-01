import { Request, Response } from 'express'
import { AuthService } from './auth.service'
import { requireField } from '../../middlewares/validate.middleware'
import { BadRequestError } from '../../core/errors'
import { config } from '../../config/env'

export const AuthController = {
  async register(req: Request, res: Response) {
    const email = requireField<string>(req.body, 'email')
    const password = requireField<string>(req.body, 'password')

    if (password.length < 6) {
      throw new BadRequestError('Password must be at least 6 characters')
    }

    const result = await AuthService.register({ email, password })

    res.cookie('finance_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
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
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
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
