import { Request, Response } from 'express'
import { config } from '../../config/env'
import { BadRequestError } from '../../core/errors'
import { verifyUnsubscribeToken } from '../../utils/unsubscribe'
import { NotificationService } from './notifications.service'

export const NotificationController = {
  async process(_req: Request, res: Response) {
    res.json(await NotificationService.processAll())
  },

  async unsubscribe(req: Request, res: Response) {
    const token = typeof req.query.token === 'string' ? req.query.token : ''
    const userId = verifyUnsubscribeToken(token)
    if (!userId) throw new BadRequestError('Enlace de baja inválido o caducado')

    await NotificationService.unsubscribe(userId)
    res.redirect(`${config.frontendUrl.replace(/\/$/, '')}/preferences?unsubscribed=1`)
  },

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
