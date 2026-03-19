import { Router } from 'express'
import { templateService } from '../../application/templateService'
import { DeletedTemplateSnapshot } from '../../domain/models/DeletedTemplateSnapshot'

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
    const id = req.params.id
    const template = await templateService.getById(id)
    if (template) {
      res.json({ success: true, data: template })
      return
    }

    const snap = await DeletedTemplateSnapshot.findOne({ sourceTemplateId: id }).lean()
    if (snap) {
      res.json({ success: true, data: { ...snap.snapshot, isSourceDeleted: true } })
      return
    }

    res.status(404).json({ success: false, message: 'Template not found' })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

export default router
