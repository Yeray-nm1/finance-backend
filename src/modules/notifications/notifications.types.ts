export const SUMMARY_FREQUENCIES = ['weekly', 'monthly'] as const
export const SUMMARY_PERIODS = ['off', ...SUMMARY_FREQUENCIES] as const
export const DAYS_BEFORE = [1, 3, 7] as const

export type SummaryFrequency = (typeof SUMMARY_FREQUENCIES)[number]
export type SummaryPeriod = (typeof SUMMARY_PERIODS)[number]
export type DaysBefore = (typeof DAYS_BEFORE)[number]

export type NotificationType =
  | 'subscription_due'
  | 'spending_summary'
  | 'goal_reminder'
  | 'goal_contribution'

export interface NotificationRules {
  subscriptionDue: {
    enabled: boolean
    emailEnabled: boolean
    daysBefore: DaysBefore
  }
  spendingSummary: {
    enabled: boolean
    emailEnabled: boolean
    frequency: SummaryFrequency
  }
  goalReminder: {
    enabled: boolean
    emailEnabled: boolean
  }
}

export type SaveNotificationRulesDTO = NotificationRules

/** Datos que el backend entrega al micro para renderizar la plantilla de email. */
export interface NotificationEmailPayload {
  template: 'subscription_due' | 'spending_summary' | 'goal_reminder' | 'goal_contribution_accept'
  data: Record<string, unknown>
}

export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  body: string
  createdAt: string
  readAt: string | null
  /** Ruta de la acción que permite completar el aviso (por ejemplo, aceptar una aportación). */
  actionUrl: string | null
}

export interface NotificationsResponse {
  items: NotificationItem[]
  unreadCount: number
}
