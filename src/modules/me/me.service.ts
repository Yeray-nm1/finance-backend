import bcrypt from 'bcrypt'
import { MeRepository } from './me.repository'
import { UserRepository } from '../auth/auth.repository'
import { BadRequestError } from '../../core/errors'

export const MeService = {
  async deleteAllData(userId: string) {
    await MeRepository.deleteAllData(userId)
  },

  async deleteAccount(userId: string, password: string) {
    const user = await UserRepository.findById(userId)

    if (!user) {
      throw new BadRequestError('Usuario no encontrado')
    }

    const validPassword = await bcrypt.compare(password, user.password)

    if (!validPassword) {
      throw new BadRequestError('La contraseña no es correcta')
    }

    await MeRepository.deleteAccount(userId)
  },
}
