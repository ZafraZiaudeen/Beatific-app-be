import { Router } from 'express'
import { requireAuth } from '../middleware/authMiddleware'
import { updateLastActive } from '../middleware/authMiddleware'
import { createManualDateJournal, getCalendarDate, getCalendarMonth } from '../../application/calendarService'

const router = Router()

router.get('/month', requireAuth, updateLastActive, async (req, res) => {
  try {
    const month = String(req.query.month || '')
    if (!/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ success: false, message: 'month must be in YYYY-MM format' })
      return
    }

    const data = await getCalendarMonth(req.user!.id, month)
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ success: false, message: err.message })
  }
})

router.get('/date/:date', requireAuth, updateLastActive, async (req, res) => {
  try {
    const calendarDate = String(req.params.date || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(calendarDate)) {
      res.status(400).json({ success: false, message: 'date must be in YYYY-MM-DD format' })
      return
    }

    const data = await getCalendarDate(req.user!.id, calendarDate)
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ success: false, message: err.message })
  }
})

router.post('/date/:date/items', requireAuth, updateLastActive, async (req, res) => {
  try {
    const calendarDate = String(req.params.date || '')
    const { contentId, slotLabel, startTime } = req.body ?? {}
    if (!/^\d{4}-\d{2}-\d{2}$/.test(calendarDate)) {
      res.status(400).json({ success: false, message: 'date must be in YYYY-MM-DD format' })
      return
    }
    if (!contentId) {
      res.status(400).json({ success: false, message: 'contentId is required' })
      return
    }

    const data = await createManualDateJournal({
      userId: req.user!.id,
      calendarDate,
      contentId: String(contentId),
      slotLabel: typeof slotLabel === 'string' ? slotLabel : undefined,
      startTime: typeof startTime === 'string' ? startTime : undefined,
    })

    res.status(201).json({ success: true, data })
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ success: false, message: err.message })
  }
})

export default router
