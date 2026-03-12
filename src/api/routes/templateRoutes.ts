import { Router } from 'express'
import { templateService } from '../../application/templateService'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const result = await templateService.list(req.query as any)
    res.json({ success: true, ...result })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const template = await templateService.getById(req.params.id)
    if (!template) {
      res.status(404).json({ success: false, message: 'Template not found' })
      return
    }
    res.json({ success: true, data: template })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

export default router
