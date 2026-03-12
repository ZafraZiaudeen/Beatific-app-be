import { Router } from 'express'
import { Permission } from '../../domain/models/Permission'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const { scope } = req.query as { scope?: string }
    const filter: Record<string, unknown> = {}
    if (scope) filter.scope = scope
    const data = await Permission.find(filter).sort({ targetType: 1 }).lean()
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.get('/:scope/:targetType', async (req, res) => {
  try {
    const perm = await Permission.findOne({
      scope: req.params.scope,
      targetType: req.params.targetType,
    }).lean()
    if (!perm) {
      res.status(404).json({ success: false, message: 'Permission not found' })
      return
    }
    res.json({ success: true, data: perm })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

export default router
