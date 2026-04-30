import { AccountRepository, CreateAccountDTO } from './accounts.repository'
import { NotFoundError } from '../../core/errors'

export const AccountService = {
  async getAll(userId: string) {
    return AccountRepository.findAll(userId)
  },

  async getById(userId: string, id: string) {
    const account = await AccountRepository.findById(userId, id)
    if (!account) {
      throw new NotFoundError('Account')
    }
    return account
  },

  async create(userId: string, dto: CreateAccountDTO) {
    return AccountRepository.create(userId, dto)
  },

  async update(userId: string, id: string, dto: Partial<CreateAccountDTO>) {
    await AccountService.getById(userId, id)
    return AccountRepository.update(userId, id, dto)
  },

  async delete(userId: string, id: string) {
    await AccountService.getById(userId, id)
    return AccountRepository.delete(userId, id)
  },
}
