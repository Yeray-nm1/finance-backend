import { Request, Response } from 'express'
import { GoalContributionService } from './goal-contributions.service'

export const GoalContributionController = {
  async getPending(req: Request, res: Response) {
    const token = typeof req.query.token === 'string' ? req.query.token : ''
    res.json(await GoalContributionService.getPending(req.userId, token))
  },

  async accept(req: Request, res: Response) {
    const token = typeof req.body.token === 'string' ? req.body.token : ''
    const accountId = typeof req.body.accountId === 'string' ? req.body.accountId : ''
    const { amount, updateSuggestion } = req.body

    res.json(await GoalContributionService.accept(req.userId, token, accountId, {
      amount,
      updateSuggestion,
    }))
  },
}
