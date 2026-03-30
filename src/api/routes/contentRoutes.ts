import { Router } from 'express'
import { Content } from '../../domain/models/Content'
import { DeletedContentSnapshot } from '../../domain/models/DeletedContentSnapshot'
import { DeletedTemplateSnapshot } from '../../domain/models/DeletedTemplateSnapshot'

const router = Router()

function buildFilter(query: Record<string, string>) {
  const { itemType, category, subcategory, search, isPublished } = query
  const filter: Record<string, unknown> = {}

  if (itemType) filter.itemType = itemType
  if (category) filter.category = category
  if (subcategory) filter.subcategory = subcategory
  if (isPublished !== undefined) filter.isPublished = isPublished === 'true'

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ]
  }

  return filter
}

router.get('/', async (req, res) => {
  try {
    const query = req.query as Record<string, string>
    const { page, limit, includePages } = query
    const filter = buildFilter(query)
    const includeFullPages = includePages === 'true'

    const pageNum = Math.max(1, parseInt(page ?? '1', 10))
    const limitNum = Math.min(100, parseInt(limit ?? '50', 10))
    const skip = (pageNum - 1) * limitNum

    const totalPromise = Content.countDocuments(filter)

    const dataPromise = includeFullPages
      ? Content.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean()
      : Content.aggregate([
          { $match: filter },
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limitNum },
          {
            $project: {
              name: 1,
              description: 1,
              itemType: 1,
              category: 1,
              subcategory: 1,
              tags: 1,
              svgContent: 1,
              coverImageUrl: 1,
              isPublished: 1,
              createdAt: 1,
              updatedAt: 1,
              pageCount: { $size: { $ifNull: ['$pages', []] } },
              coverBackground: {
                $let: {
                  vars: { firstPage: { $arrayElemAt: ['$pages', 0] } },
                  in: '$$firstPage.background',
                },
              },
            },
          },
        ])

    const [data, total] = await Promise.all([dataPromise, totalPromise])

    res.json({ success: true, data, total, page: pageNum, limit: limitNum })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id
    const content = await Content.findById(id).lean()
    if (content) {
      res.json({ success: true, data: content })
      return
    }

    const contentSnap = await DeletedContentSnapshot.findOne({ sourceContentId: id }).lean()
    if (contentSnap) {
      res.json({ success: true, data: { ...contentSnap.snapshot, isSourceDeleted: true } })
      return
    }

    const templateSnap = await DeletedTemplateSnapshot.findOne({ sourceTemplateId: id }).lean()
    if (templateSnap) {
      res.json({ success: true, data: { ...templateSnap.snapshot, isSourceDeleted: true } })
      return
    }

    res.status(404).json({ success: false, message: 'Content not found' })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

export default router
