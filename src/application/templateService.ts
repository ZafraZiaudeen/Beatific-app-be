import { Template } from '../domain/models/Template'
import { ITemplate } from '../domain/interfaces/ITemplate'

export interface ListTemplatesQuery {
  category?:    string
  subcategory?: string
  tags?:        string
  isPublished?: string
  page?:        string
  limit?:       string
  search?:      string
}

export class TemplateService {
  async list(query: ListTemplatesQuery): Promise<{
    data: ITemplate[]
    total: number
    page: number
    limit: number
  }> {
    const filter: Record<string, unknown> = {}

    if (query.category)    filter.category    = query.category
    if (query.subcategory) filter.subcategory = query.subcategory

    if (query.tags) {
      filter.tags = { $in: query.tags.split(',').map((t: string) => t.trim()) }
    }

    if (query.isPublished !== undefined) {
      filter.isPublished = query.isPublished === 'true'
    }

    if (query.search) {
      filter.$or = [
        { name:        { $regex: query.search, $options: 'i' } },
        { description: { $regex: query.search, $options: 'i' } },
      ]
    }

    const page  = Math.max(1,   parseInt(query.page  ?? '1',  10))
    const limit = Math.min(100, parseInt(query.limit ?? '20', 10))
    const skip  = (page - 1) * limit

    const [data, total] = await Promise.all([
      Template.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Template.countDocuments(filter),
    ])

    return { data: data as unknown as ITemplate[], total, page, limit }
  }

  async getById(id: string): Promise<ITemplate | null> {
    return Template.findById(id).lean() as Promise<ITemplate | null>
  }
}

export const templateService = new TemplateService()
