import { Router } from 'express'
import { Content } from '../../domain/models/Content'
import { DeletedContentSnapshot } from '../../domain/models/DeletedContentSnapshot'
import { DeletedTemplateSnapshot } from '../../domain/models/DeletedTemplateSnapshot'

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
    const id = req.params.id
    const content = await Content.findById(id).lean()
    if (content) {
      res.json({ success: true, data: content })
      return
    }

    // Fallback: check deleted snapshots so journal users can still view the content
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
