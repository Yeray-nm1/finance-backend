import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflowPath = resolve(process.cwd(), '.github/workflows/ci.yml')

function workflow(): string {
  return readFileSync(workflowPath, 'utf8')
}

describe('CI · deploy automático del backend en Render', () => {
  it('el job de deploy espera a que pase el build', () => {
    const content = workflow()
    expect(content).toMatch(/\n {2}deploy:\n/)
    expect(content).toMatch(/needs:\s*\[build\]/)
  })

  it('el deploy solo se dispara en push a main', () => {
    expect(workflow()).toContain("if: github.event_name == 'push' && github.ref == 'refs/heads/main'")
  })

  it('usa el deploy hook de Render como secreto sin interpolalo en el comando', () => {
    const content = workflow()
    expect(content).toContain('RENDER_DEPLOY_HOOK_URL: ${{ secrets.RENDER_DEPLOY_HOOK_URL }}')
    const curlLine = content.split('\n').find((line) => line.includes('curl') && line.includes('RENDER_DEPLOY_HOOK_URL'))
    expect(curlLine).toContain('$RENDER_DEPLOY_HOOK_URL')
    expect(curlLine).not.toContain('${{')
    expect(curlLine).toContain('--fail')
  })

  it('falla con un mensaje claro si falta el secreto del hook', () => {
    expect(workflow()).toContain('Falta el secreto RENDER_DEPLOY_HOOK_URL')
  })
})
