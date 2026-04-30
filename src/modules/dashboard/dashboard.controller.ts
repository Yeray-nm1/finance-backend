import { Request, Response } from 'express'
import { DashboardService } from './dashboard.service'

export const DashboardController = {
  async getDashboard(req: Request, res: Response) {
    const now = new Date()
    const year = req.query.year ? parseInt(req.query.year as string, 10) : now.getFullYear()
    const month = req.query.month ? parseInt(req.query.month as string, 10) : now.getMonth() + 1

    const dashboard = await DashboardService.getDashboard(req.userId, year, month)
    res.json(dashboard)
  },
}
