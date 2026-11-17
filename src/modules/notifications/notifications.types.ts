export const SUMMARY_FREQUENCIES = ['weekly', 'monthly'] as const
export const SUMMARY_PERIODS = ['off', ...SUMMARY_FREQUENCIES] as const
export const DAYS_BEFORE = [1, 3, 7] as const

export type SummaryFrequency = (typeof SUMMARY_FREQUENCIES)[number]
export type SummaryPeriod = (typeof SUMMARY_PERIODS)[number]
export type DaysBefore = (typeof DAYS_BEFORE)[number]

export type NotificationType = 'subscription_due' | 'spending_summary'

export interface NotificationRules {
  subscriptionDue: {
    enabled: boolean
    daysBefore: DaysBefore
  }
  spendingSummary: {
    enabled: boolean
    frequency: SummaryFrequency
  }
}

export type SaveNotificationRulesDTO = NotificationRules

export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  body: string
  createdAt: string
  readAt: string | null
}

export interface NotificationsResponse {
  items: NotificationItem[]
  unreadCount: number
}
