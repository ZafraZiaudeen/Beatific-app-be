import { Category } from '../domain/models/Category'
import { ICategory } from '../domain/interfaces/ICategory'

export class CategoryService {
  async list(itemType?: string): Promise<ICategory[]> {
    const filter = itemType ? { itemType } : {}
    return Category.find(filter).sort({ order: 1, createdAt: 1 }).lean() as Promise<ICategory[]>
  }

  async getById(id: string): Promise<ICategory | null> {
    return Category.findById(id).lean() as Promise<ICategory | null>
  }
}

export const categoryService = new CategoryService()
