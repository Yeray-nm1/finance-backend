import { config } from '../../config/env'

export type EmailTemplateName = 'subscription_due' | 'spending_summary' | 'password_reset'

/** Nombre visible con el que el dashboard financiero se identifica ante el micro de email. */
export const FINANCE_FROM_NAME = 'Finance Dashboard'

export interface NotificationEmail {
  to: string
  fromName: string
  template: EmailTemplateName
  data: Record<string, unknown>
  idempotencyKey: string
}

/** Desacopla la lógica de avisos del mecanismo de entrega (micro HTTP, stub en tests, etc.). */
export interface NotificationSender {
  send(message: NotificationEmail): Promise<void>
}

export class HttpNotificationSender implements NotificationSender {
  constructor(
    private readonly baseUrl: string | undefined = config.emailServiceUrl,
    private readonly apiKey: string | undefined = config.emailServiceApiKey,
  ) {}

  async send(message: NotificationEmail): Promise<void> {
    if (!this.baseUrl || !this.apiKey) {
      throw new Error('Email service is not configured')
    }

    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/v1/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey,
      },
      body: JSON.stringify(message),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Email service responded ${response.status}: ${detail}`)
    }
  }
}

export const notificationSender: NotificationSender = new HttpNotificationSender()
