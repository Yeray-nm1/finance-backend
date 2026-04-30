import { Request, Response } from 'express'
import { CategoryService } from './categories.service'
import { requireFields, requireEnum } from '../../middlewares/validate.middleware'

export const CategoryController = {
  async getAll(req: Request, res: Response) {
    const categories = await CategoryService.getAll(req.userId)
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
