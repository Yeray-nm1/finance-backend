import bcrypt from 'bcrypt'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/modules/auth/auth.repository', () => ({
  UserRepository: {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    updatePassword: vi.fn(),
  },
}))

import { UserRepository } from '../src/modules/auth/auth.repository'
import { AuthService } from '../src/modules/auth/auth.service'
import { signResetToken } from '../src/modules/auth/reset-token'
import type { NotificationSender } from '../src/modules/notifications/notification-sender'

const repo = vi.mocked(UserRepository)
const OLD_PASSWORD = 'OldPassword123'
const NEW_PASSWORD = 'NewPassword123'

beforeEach(() => {
  vi.clearAllMocks()
})

function fakeSender() {
  const send = vi.fn(async () => {})
  return { sender: { send } as unknown as NotificationSender, send }
}

describe('recuperación de contraseña', () => {
  it('no revela si el email existe y no envía nada cuando no está registrado', async () => {
    repo.findByEmail.mockResolvedValueOnce(null)
    const { sender, send } = fakeSender()

    await expect(AuthService.requestPasswordReset('nobody@example.com', sender)).resolves.toBeUndefined()
    expect(send).not.toHaveBeenCalled()
  })

  it('envía el enlace de restablecimiento con la plantilla y el nombre de la app', async () => {
    repo.findByEmail.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      password: 'hash-guardado',
      createdAt: new Date(),
    })
    const { sender, send } = fakeSender()

    await AuthService.requestPasswordReset('user@example.com', sender)

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        fromName: 'Finance Dashboard',
        template: 'password_reset',
        data: { resetUrl: expect.stringContaining('/reset-password?token=') },
        idempotencyKey: expect.stringMatching(/^finance:password_reset:/),
      })
    )
  })

  it('cambia la contraseña con un token válido', async () => {
    const currentHash = await bcrypt.hash(OLD_PASSWORD, 10)
    repo.findById.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      password: currentHash,
      createdAt: new Date(),
    })
    const token = signResetToken('user-1', currentHash)

    await AuthService.resetPassword(token, NEW_PASSWORD)

    expect(repo.updatePassword).toHaveBeenCalledTimes(1)
    const [userId, newHash] = repo.updatePassword.mock.calls[0] as [string, string]
    expect(userId).toBe('user-1')
    expect(await bcrypt.compare(NEW_PASSWORD, newHash)).toBe(true)
    expect(await bcrypt.compare(OLD_PASSWORD, newHash)).toBe(false)
  })

  it('rechaza el enlace si la contraseña se cambió después de emitirlo', async () => {
    const issuedHash = await bcrypt.hash(OLD_PASSWORD, 10)
    const currentHash = await bcrypt.hash(NEW_PASSWORD, 10)
    repo.findById.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      password: currentHash,
      createdAt: new Date(),
    })
    const token = signResetToken('user-1', issuedHash)

    await expect(AuthService.resetPassword(token, 'AnotherPassword123')).rejects.toThrow(
      'no válido o caducado'
    )
    expect(repo.updatePassword).not.toHaveBeenCalled()
  })

  it('rechaza un token que no corresponde al usuario', async () => {
    repo.findById.mockResolvedValueOnce(null)

    await expect(
      AuthService.resetPassword(signResetToken('missing-user', 'hash'), NEW_PASSWORD)
    ).rejects.toThrow('no válido o caducado')
  })
})
