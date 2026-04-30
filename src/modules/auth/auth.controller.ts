import { Request, Response } from 'express'
import { AuthService } from './auth.service'
import { requireFields, requireField } from '../../middlewares/validate.middleware'
import { BadRequestError } from '../../core/errors'

export const AuthController = {
  async register(req: Request, res: Response) {
    const email = requireField<string>(req.body, 'email')
    const password = requireField<string>(req.body, 'password')

    if (password.length < 6) {
      throw new BadRequestError('Password must be at least 6 characters')
    }

    const result = await AuthService.register({ email, password })

    res.status(201).json(result)
  },

  async login(req: Request, res: Response) {
    const email = requireField<string>(req.body, 'email')
    const password = requireField<string>(req.body, 'password')

    const result = await AuthService.login({ email, password })

    res.json(result)
  },
}
