import jwt from 'jsonwebtoken'
import { describe, expect, it } from 'vitest'
import { config } from '../src/config/env'
import { decodeResetToken, passwordFingerprint, signResetToken } from '../src/modules/auth/reset-token'

const USER_ID = 'user-1'
const PASSWORD_HASH = '$2b$10$abcdefghijklmnopqrstuv'

describe('token de restablecimiento de contraseña', () => {
  it('firma y verifica un token con scope de restablecimiento', () => {
    const token = signResetToken(USER_ID, PASSWORD_HASH)

    expect(decodeResetToken(token)).toMatchObject({ sub: USER_ID, scope: 'password_reset' })
  })

  it('rechaza un token de sesión normal', () => {
    const sessionToken = jwt.sign({ userId: USER_ID }, config.jwtSecret, { expiresIn: '7d' })

    expect(() => decodeResetToken(sessionToken)).toThrow('no válido o caducado')
  })

  it('rechaza un token caducado', () => {
    const expired = jwt.sign(
      {
        sub: USER_ID,
        scope: 'password_reset',
        pwd: passwordFingerprint(PASSWORD_HASH),
        jti: 'expired',
      },
      config.jwtSecret,
      { expiresIn: '-1s' },
    )

    expect(() => decodeResetToken(expired)).toThrow('no válido o caducado')
  })

  it('rechaza un token manipulado', () => {
    expect(() => decodeResetToken(`${signResetToken(USER_ID, PASSWORD_HASH)}tampered`)).toThrow(
      'no válido o caducado'
    )
  })

  it('la huella cambia cuando cambia el hash guardado', () => {
    expect(passwordFingerprint(PASSWORD_HASH)).not.toBe(passwordFingerprint(`${PASSWORD_HASH}-otro`))
  })
})
