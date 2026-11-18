import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpNotificationSender } from '../src/modules/notifications/notification-sender'

afterEach(() => {
  vi.unstubAllGlobals()
})

const message = {
  to: 'user@example.com',
  fromName: 'Finance Dashboard',
  template: 'subscription_due' as const,
  data: { description: 'Netflix' },
  idempotencyKey: 'finance:abc',
}

function stubFetch() {
  const fetchMock = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 202,
      text: async () => '',
      json: async () => ({}),
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('HttpNotificationSender', () => {
  it('envía el fromName de la app al micro sin alterar el resto del payload', async () => {
    const fetchMock = stubFetch()
    const sender = new HttpNotificationSender('https://email.example.com', 'micro-key')

    await sender.send(message)

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual(message)
  })

  it('falla cerrado si no hay URL o key del micro', async () => {
    const fetchMock = stubFetch()

    await expect(new HttpNotificationSender('', 'key').send(message)).rejects.toThrow('Email service is not configured')
    await expect(new HttpNotificationSender('https://email.example.com', '').send(message)).rejects.toThrow(
      'Email service is not configured'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
