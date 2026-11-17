import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflowPath = resolve(process.cwd(), '.github/workflows/email-digest.yml')

function workflow(): string {
  return readFileSync(workflowPath, 'utf8')
}

describe('WI-4 · workflow schedule de avisos por email', () => {
  it('existe el workflow', () => {
    expect(() => workflow()).not.toThrow()
  })

  it('se dispara diariamente a las 06:00 UTC y admite ejecución manual', () => {
    const content = workflow()
    expect(content).toMatch(/on:\s*\n\s*schedule:/)
    expect(content).toContain("cron: '0 6 * * *'")
    expect(content).toContain('workflow_dispatch:')
  })

  it('invoca el endpoint interno con el secreto de GitHub sin exponerlo en el comando', () => {
    const content = workflow()
    expect(content).toContain('CRON_SECRET: ${{ secrets.CRON_SECRET }}')
    expect(content).toContain('x-cron-secret: ${CRON_SECRET}')
    expect(content).toContain('/api/v1/internal/notifications/process')
    expect(content).toContain('--fail')
  })
})
