import { Router } from 'express'
import { MainCategory } from '../../domain/models/MainCategory'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const data = await MainCategory.find({}).sort({ order: 1, createdAt: 1 }).lean()
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.get('/:slug', async (req, res) => {
  try {
    const cat = await MainCategory.findOne({ slug: req.params.slug }).lean()
    if (!cat) {
      res.status(404).json({ success: false, message: 'Main category not found' })
      return
    }
    res.json({ success: true, data: cat })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

export default router
