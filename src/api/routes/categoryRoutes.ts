import { Router } from 'express'
import { categoryService } from '../../application/categoryService'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const { itemType } = req.query as { itemType?: string }
    const data = await categoryService.list(itemType)
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const category = await categoryService.getById(req.params.id)
    if (!category) {
      res.status(404).json({ success: false, message: 'Category not found' })
      return
    }
    res.json({ success: true, data: category })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

export default router
