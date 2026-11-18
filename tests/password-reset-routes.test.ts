import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const routes = readFileSync(resolve(process.cwd(), 'src/modules/auth/auth.routes.ts'), 'utf8')

describe('rutas de recuperación de contraseña', () => {
  it('registra solicitud y restablecimiento sin sesión', () => {
    expect(routes).toContain("router.post('/forgot-password', forgotPasswordLimiter, AuthController.forgotPassword)")
    expect(routes).toContain("router.post('/reset-password', resetPasswordLimiter, AuthController.resetPassword)")
  })

  it('limita ambas rutas', () => {
    expect(routes).toContain('const forgotPasswordLimiter = rateLimit({')
    expect(routes).toContain('const resetPasswordLimiter = rateLimit({')
  })
})
