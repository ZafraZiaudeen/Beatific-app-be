import { Router } from 'express'
import { Content } from '../../domain/models/Content'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const { itemType, category, subcategory, search, isPublished, page, limit } = req.query as Record<string, string>
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

    const pageNum = Math.max(1, parseInt(page ?? '1', 10))
    const limitNum = Math.min(100, parseInt(limit ?? '50', 10))
    const skip = (pageNum - 1) * limitNum

    const [data, total] = await Promise.all([
      Content.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Content.countDocuments(filter),
    ])

    res.json({ success: true, data, total, page: pageNum, limit: limitNum })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const content = await Content.findById(req.params.id).lean()
    if (!content) {
      res.status(404).json({ success: false, message: 'Content not found' })
      return
    }
    res.json({ success: true, data: content })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

export default router
