import { AccountRepository, CreateAccountDTO } from './accounts.repository'
import { BadRequestError, NotFoundError } from '../../core/errors'

const ACCOUNT_TYPES = ['checking', 'savings'] as const

function normalizeName(name: string): string {
  const trimmed = name.trim()

  if (!trimmed) {
    throw new BadRequestError('El nombre de la cuenta es obligatorio')
  }

  return trimmed
}

function normalizeType(type: string): string {
  if (!ACCOUNT_TYPES.includes(type as (typeof ACCOUNT_TYPES)[number])) {
    throw new BadRequestError('El tipo de cuenta debe ser checking o savings')
  }

  return type
}

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

  async getDefault(userId: string) {
    return AccountRepository.findFirst(userId)
  },

  async getOwnedId(userId: string, id: string) {
    const account = await AccountService.getById(userId, id)
    return account.id
  },

  async create(userId: string, dto: CreateAccountDTO) {
    return AccountRepository.create(userId, {
      name: normalizeName(dto.name),
      type: normalizeType(dto.type),
    })
  },

  async update(userId: string, id: string, dto: Partial<CreateAccountDTO>) {
    await AccountService.getById(userId, id)

    const data: Partial<CreateAccountDTO> = {}

    if (dto.name !== undefined) data.name = normalizeName(dto.name)
    if (dto.type !== undefined) data.type = normalizeType(dto.type)

    return AccountRepository.update(userId, id, data)
  },

  async delete(userId: string, id: string) {
    await AccountService.getById(userId, id)
    await AccountRepository.detachTransactions(userId, id)
    return AccountRepository.delete(userId, id)
  },
}
