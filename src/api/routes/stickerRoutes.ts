import { Router } from 'express'
import { stickerService } from '../../application/stickerService'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const result = await stickerService.list(req.query as any)
    res.json({ success: true, ...result })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const sticker = await stickerService.getById(req.params.id)
    if (!sticker) {
      res.status(404).json({ success: false, message: 'Sticker not found' })
      return
    }
    res.json({ success: true, data: sticker })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

export default router
