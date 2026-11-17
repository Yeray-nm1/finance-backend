import { Request, Response } from 'express'
import { NotificationService } from './notifications.service'

export const NotificationController = {
  async list(req: Request, res: Response) {
    const notifications = await NotificationService.list(req.userId)
    res.json(notifications)
  },

  async getRules(req: Request, res: Response) {
    const rules = await NotificationService.getRules(req.userId)
    res.json(rules)
  },

  async saveRules(req: Request, res: Response) {
    const rules = await NotificationService.saveRules(req.userId, req.body)
    res.json(rules)
  },

  async markRead(req: Request, res: Response) {
    await NotificationService.markRead(req.userId, req.params.id as string)
    res.status(204).send()
  },

  async markAllRead(req: Request, res: Response) {
    await NotificationService.markAllRead(req.userId)
    res.status(204).send()
  },
}
