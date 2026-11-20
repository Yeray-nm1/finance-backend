import bcrypt from 'bcrypt'
import type { Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/modules/auth/auth.repository', () => ({
  UserRepository: {
    findByEmail: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    updateName: vi.fn(),
    updatePassword: vi.fn(),
  },
}))

import { AuthController } from '../src/modules/auth/auth.controller'
import { UserRepository } from '../src/modules/auth/auth.repository'
import { AuthService } from '../src/modules/auth/auth.service'

const repo = vi.mocked(UserRepository)
const CREATED = new Date('2026-11-20T10:00:00.000Z')

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    email: 'ana@example.com',
    password: 'hashed',
    name: null as string | null,
    createdAt: CREATED,
    ...overrides,
  }
}

function fakeResponse() {
  const json = vi.fn()
  const cookie = vi.fn()
  const status = vi.fn().mockReturnValue({ json })
  return { res: { json, cookie, status } as unknown as Response, json }
}

beforeEach(() => {
  vi.clearAllMocks()
  repo.findByEmail.mockResolvedValue(null as never)
})

describe('nombre de usuario · AuthService', () => {
  it('CA-1/CA-2 registra sin nombre y lo devuelve como null', async () => {
    repo.create.mockResolvedValue(user() as never)

    const result = await AuthService.register({ email: 'ana@example.com', password: 'Password1' })

    expect(repo.create).toHaveBeenCalledWith('ana@example.com', expect.any(String), null)
    expect(result.user).toMatchObject({ id: 'u1', email: 'ana@example.com', name: null })
  })

  it('CA-2 recorta el nombre del registro y lo persiste', async () => {
    repo.create.mockResolvedValue(user({ name: 'Ana' }) as never)

    const result = await AuthService.register({
      email: 'ana@example.com',
      password: 'Password1',
      name: '  Ana  ',
    })

    expect(repo.create).toHaveBeenCalledWith('ana@example.com', expect.any(String), 'Ana')
    expect(result.user.name).toBe('Ana')
  })

  it('CA-2 un nombre vacío se guarda como null y usa la parte local del email', async () => {
    repo.create.mockResolvedValue(user() as never)

    await AuthService.register({ email: 'ana@example.com', password: 'Password1', name: '   ' })

    expect(repo.create).toHaveBeenCalledWith('ana@example.com', expect.any(String), null)
  })

  it.each([
    ['no es texto', 42],
    ['demasiado largo', 'a'.repeat(51)],
  ])('CA-2 rechaza un nombre %s', async (_case, name) => {
    await expect(
      AuthService.register({ email: 'ana@example.com', password: 'Password1', name })
    ).rejects.toThrow()

    expect(repo.create).not.toHaveBeenCalled()
  })

  it('CA-3 login y me devuelven el nombre guardado', async () => {
    const password = await bcrypt.hash('Password1', 10)
    repo.findByEmail.mockResolvedValue(user({ name: 'Ana', password }) as never)
    repo.findById.mockResolvedValue(user({ name: 'Ana', password }) as never)

    const login = await AuthService.login({ email: 'ana@example.com', password: 'Password1' })
    const me = await AuthService.me('u1')

    expect(login.user.name).toBe('Ana')
    expect(me.name).toBe('Ana')
  })

  it('CA-3 updateName normaliza, guarda y devuelve el usuario', async () => {
    repo.findById.mockResolvedValue(user() as never)
    repo.updateName.mockResolvedValue(user({ name: 'Ana' }) as never)

    const result = await AuthService.updateName('u1', '  Ana  ')

    expect(repo.updateName).toHaveBeenCalledWith('u1', 'Ana')
    expect(result.name).toBe('Ana')
  })

  it('CA-3 updateName limpia el nombre con cadena vacía o null', async () => {
    repo.findById.mockResolvedValue(user({ name: 'Ana' }) as never)
    repo.updateName.mockResolvedValue(user({ name: null }) as never)

    await AuthService.updateName('u1', '')
    await AuthService.updateName('u1', null)

    expect(repo.updateName).toHaveBeenNthCalledWith(1, 'u1', null)
    expect(repo.updateName).toHaveBeenNthCalledWith(2, 'u1', null)
  })

  it('CA-4 el correo de reset usa el nombre cuando existe', async () => {
    repo.findByEmail.mockResolvedValue(user({ name: 'Ana' }) as never)
    const sender = { send: vi.fn().mockResolvedValue(undefined) }

    await AuthService.requestPasswordReset('ana@example.com', sender)

    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'password_reset',
        data: expect.objectContaining({ recipientName: 'Ana' }),
      })
    )
  })

  it('CA-4 el correo de reset cae a la parte local del email', async () => {
    repo.findByEmail.mockResolvedValue(user({ email: 'ana.perez@example.com' }) as never)
    const sender = { send: vi.fn().mockResolvedValue(undefined) }

    await AuthService.requestPasswordReset('ana.perez@example.com', sender)

    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recipientName: 'ana.perez' }),
      })
    )
  })
})

describe('nombre de usuario · AuthController', () => {
  it('CA-2 register reenvía el nombre opcional al servicio', async () => {
    const register = vi.spyOn(AuthService, 'register').mockResolvedValue({
      user: user({ name: 'Ana' }),
      token: 't',
      expiresAt: CREATED.toISOString(),
    } as never)
    const { res, json } = fakeResponse()

    await AuthController.register(
      { body: { email: 'ana@example.com', password: 'Password1', name: ' Ana ' } } as never,
      res
    )

    expect(register).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'Password1',
      name: ' Ana ',
    })
    expect(json).toHaveBeenCalledWith({ user: expect.objectContaining({ name: 'Ana' }) })
  })

  it('CA-3 expone PUT /auth/me a través del controlador', async () => {
    const updateName = vi.spyOn(AuthService, 'updateName').mockResolvedValue(user({ name: 'Ana' }) as never)
    const { res, json } = fakeResponse()

    await AuthController.updateName(
      { body: { name: 'Ana' }, userId: 'u1' } as never,
      res
    )

    expect(updateName).toHaveBeenCalledWith('u1', 'Ana')
    expect(json).toHaveBeenCalledWith({ user: expect.objectContaining({ name: 'Ana' }) })
  })
})
