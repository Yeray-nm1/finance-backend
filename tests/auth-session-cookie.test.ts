import type { Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/modules/auth/auth.service', () => ({
  AuthService: {
    register: vi.fn(),
    login: vi.fn(),
  },
}))

import { AuthController } from '../src/modules/auth/auth.controller'
import { AuthService } from '../src/modules/auth/auth.service'

const auth = vi.mocked(AuthService)

function fakeResponse() {
  const cookie = vi.fn()
  const json = vi.fn()
  return { res: { cookie, json } as unknown as Response, cookie, json }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('cookie de sesión', () => {
  it('FIX-1 usa SameSite=Lax para que el enlace del correo conserve la sesión', async () => {
    auth.login.mockResolvedValue({
      token: 'token-jwt',
      expiresAt: '2026-12-18T12:00:00.000Z',
      user: { id: 'u1' },
    } as never)
    const { res, cookie } = fakeResponse()

    await AuthController.login(
      { body: { email: 'user@example.com', password: 'Password123' } } as never,
      res
    )

    expect(cookie).toHaveBeenCalledWith(
      'finance_token',
      'token-jwt',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' })
    )
  })
})
