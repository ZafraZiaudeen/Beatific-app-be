import { Router } from 'express'
import { Journal } from '../../domain/models/Journal'
import { Content } from '../../domain/models/Content'
import { Template } from '../../domain/models/Template'
import { requireAuth } from '../middleware/authMiddleware'

const MAX_COPIES = 3

const router = Router()

async function findContentById(id: string) {
  return (await Content.findById(id).lean()) ?? (await Template.findById(id).lean())
}

async function enrichJournal(j: any) {
  const content = await findContentById(j.templateId)
  if (!content) return null
  const copyLabel = j.copyNumber === 0
    ? (content as any).name
    : `${(content as any).name} - Copy ${j.copyNumber}`
  return {
    _id: j._id,
    templateId: j.templateId,
    copyNumber: j.copyNumber ?? 0,
    copyLabel,
    pageOrder: j.pageOrder,
    updatedAt: j.updatedAt,
    createdAt: j.createdAt,
    content: {
      _id: (content as any)._id,
      name: (content as any).name,
      coverImageUrl: (content as any).coverImageUrl,
      category: (content as any).category,
      subcategory: (content as any).subcategory,
      itemType: (content as any).itemType,
      pageCount: ((content as any).pages ?? []).length,
    },
  }
}

router.get('/mine', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id
    const journals = await Journal.find({ userId }).sort({ updatedAt: -1 }).lean()

    const enriched = (
      await Promise.all(journals.map(enrichJournal))
    ).filter(Boolean)

    res.json({ success: true, data: enriched })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.get('/recent-pages', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id
    const journals = await Journal.find({ userId }).sort({ updatedAt: -1 }).limit(8).lean()

    const pages: any[] = []

    for (const j of journals) {
      if (pages.length >= 8) break

      const content = await findContentById(j.templateId)
      if (!content) continue

      const allPages = (content as any).pages ?? []
      const selectedIndices = j.pageOrder ?? []
      for (let li = 0; li < selectedIndices.length; li++) {
        if (pages.length >= 8) break
        const idx = selectedIndices[li]
        const page = allPages[idx]
        if (!page) continue
        pages.push({
          journalId: j._id,
          templateId: j.templateId,
          copyNumber: j.copyNumber ?? 0,
          templateName: (content as any).name,
          templateCoverImageUrl: (content as any).coverImageUrl,
          subcategory: (content as any).subcategory,
          pageIndex: idx,
          localIndex: li,
          pageId: page.id,
          pageName: page.name,
          pageBackground: page.background,
          pageElements: page.elements ?? [],
          pageWidth: page.width ?? 595,
          pageHeight: page.height ?? 842,
          updatedAt: j.updatedAt,
        })
      }
    }

    res.json({ success: true, data: pages.slice(0, 8) })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.get('/for-template/:templateId', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id
    const { templateId } = req.params
    const journals = await Journal.find({ userId, templateId }).sort({ copyNumber: 1 }).lean()

    const enriched = (
      await Promise.all(journals.map(enrichJournal))
    ).filter(Boolean)

    res.json({ success: true, data: enriched, copyCount: journals.filter(j => (j.copyNumber ?? 0) > 0).length })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.post('/create-copy', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id
    const { templateId, pageOrder } = req.body
    if (!templateId || !Array.isArray(pageOrder)) {
      res.status(400).json({ success: false, message: 'templateId and pageOrder[] are required' })
      return
    }

    const existingCopies = await Journal.countDocuments({ userId, templateId, copyNumber: { $gt: 0 } })
    if (existingCopies >= MAX_COPIES) {
      res.status(400).json({
        success: false,
        message: `You can create a maximum of ${MAX_COPIES} copies per template.`,
      })
      return
    }

    const highest = await Journal.findOne({ userId, templateId, copyNumber: { $gt: 0 } })
      .sort({ copyNumber: -1 })
      .lean()
    const nextCopy = (highest?.copyNumber ?? 0) + 1

    const journal = await Journal.create({
      userId,
      templateId,
      copyNumber: nextCopy,
      pageOrder,
    })

    res.json({ success: true, data: journal.toObject() })
  } catch (err: any) {
    if (err.code === 11000) {
      res.status(409).json({ success: false, message: 'This copy already exists.' })
      return
    }
    res.status(500).json({ success: false, message: err.message })
  }
})

router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id
    const { templateId, journalId } = req.query as Record<string, string>

    if (journalId) {
      const journal = await Journal.findOne({ _id: journalId, userId }).lean()
      res.json({ success: true, data: journal })
      return
    }

    if (!templateId) {
      res.status(400).json({ success: false, message: 'templateId or journalId is required' })
      return
    }
    const journal = await Journal.findOne({ userId, templateId, copyNumber: 0 }).lean()
    res.json({ success: true, data: journal })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.put('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id
    const { templateId, pageOrder, journalId } = req.body
    if (!Array.isArray(pageOrder)) {
      res.status(400).json({ success: false, message: 'pageOrder[] is required' })
      return
    }

    if (journalId) {
      const journal = await Journal.findOneAndUpdate(
        { _id: journalId, userId },
        { pageOrder },
        { new: true }
      ).lean()
      if (!journal) {
        res.status(404).json({ success: false, message: 'Journal not found' })
        return
      }
      res.json({ success: true, data: journal })
      return
    }

    if (!templateId) {
      res.status(400).json({ success: false, message: 'templateId or journalId is required' })
      return
    }
    const journal = await Journal.findOneAndUpdate(
      { userId, templateId, copyNumber: 0 },
      { userId, templateId, copyNumber: 0, pageOrder },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean()
    res.json({ success: true, data: journal })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

export default router
