import { Sticker } from '../domain/models/Sticker'
import { ISticker } from '../domain/interfaces/ISticker'

export interface ListStickersQuery {
  category?:    string
  subcategory?: string
  tags?:        string
  isPublished?: string
  page?:        string
  limit?:       string
  search?:      string
}

export class StickerService {
  async list(query: ListStickersQuery): Promise<{
    data: ISticker[]
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
      Sticker.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Sticker.countDocuments(filter),
    ])

    return { data: data as unknown as ISticker[], total, page, limit }
  }

  async getById(id: string): Promise<ISticker | null> {
    return Sticker.findById(id).lean() as Promise<ISticker | null>
  }
}

export const stickerService = new StickerService()
