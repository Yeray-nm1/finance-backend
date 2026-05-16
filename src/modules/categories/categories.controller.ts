import { Request, Response } from 'express'
import { CategoryService } from './categories.service'
import { requireFields, requireEnum } from '../../middlewares/validate.middleware'

export const CategoryController = {
  async getAll(req: Request, res: Response) {
    const search = req.query.search as string | undefined
    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined
    const categories = await CategoryService.getAll(req.userId, { search, page, limit })
    res.json(categories)
  },

  async getById(req: Request, res: Response) {
    const category = await CategoryService.getById(req.userId, req.params.id as string)
    res.json(category)
  },

  async create(req: Request, res: Response) {
    requireFields(req.body, 'name', 'type')
    const { name, type } = req.body

    const category = await CategoryService.create(req.userId, {
      name,
      type: requireEnum(type, ['needs', 'leisure', 'savings', 'other'], 'type'),
    })
    res.status(201).json(category)
  },

  async update(req: Request, res: Response) {
    const { name, type } = req.body
    const category = await CategoryService.update(req.userId, req.params.id as string, { name, type })
    res.json(category)
  },

  async delete(req: Request, res: Response) {
    await CategoryService.delete(req.userId, req.params.id as string)
    res.status(204).send()
  },
}
