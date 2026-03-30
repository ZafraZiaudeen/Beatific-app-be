import { Router } from 'express'
import { Journal } from '../../domain/models/Journal'
import { Content } from '../../domain/models/Content'
import { Template } from '../../domain/models/Template'
import { DeletedContentSnapshot } from '../../domain/models/DeletedContentSnapshot'
import { DeletedTemplateSnapshot } from '../../domain/models/DeletedTemplateSnapshot'
import { requireAuth } from '../middleware/authMiddleware'
import { updateLastActive } from '../middleware/authMiddleware'

const MAX_COPIES = 3
const MAX_RECENT_PAGE_ACTIVITY = 12
const MAX_SYNC_DRAWING_PATHS = 80
const MAX_SYNC_PAGE_ELEMENTS = 200
const MAX_SYNC_JOURNAL_PAGES = 250
const MAX_SYNC_JOURNAL_DRAWING_PATHS = 2500
const MAX_SYNC_JOURNAL_PAGE_ELEMENTS = 1500

const router = Router()

type PageOrderRef = string | number

type SyncedDrawingPath = {
  d: string
  color: string
  width: number
  opacity?: number
}

type SourceDocument = {
  _id?: string
  name?: string
  coverImageUrl?: string
  category?: string
  subcategory?: string
  itemType?: string
  pageCount?: number
  pages?: any[]
}

type LoadedSource = {
  source: SourceDocument
  isSourceDeleted: boolean
}

function resolvePageIndexFromRef(allPages: any[], ref: PageOrderRef): number {
  if (typeof ref === 'number' && Number.isInteger(ref)) {
    return ref >= 0 && ref < allPages.length ? ref : -1
  }

  if (typeof ref === 'string') {
    const byId = allPages.findIndex((p) => p?.id === ref)
    if (byId >= 0) return byId

    if (/^\d+$/.test(ref)) {
      const asIndex = Number(ref)
      return asIndex >= 0 && asIndex < allPages.length ? asIndex : -1
    }
  }

  return -1
}

async function findContentById(id: string) {
  return (await Content.findById(id).lean()) ?? (await Template.findById(id).lean())
}

async function findDeletedSnapshot(id: string): Promise<Record<string, unknown> | null> {
  const contentSnap = await DeletedContentSnapshot.findOne({ sourceContentId: id }).lean()
  if (contentSnap) return contentSnap.snapshot as Record<string, unknown>

  const templateSnap = await DeletedTemplateSnapshot.findOne({ sourceTemplateId: id }).lean()
  if (templateSnap) return templateSnap.snapshot as Record<string, unknown>

  return null
}

function toSourceDocument(source: any): SourceDocument {
  const pages = Array.isArray(source?.pages) ? source.pages : []

  return {
    _id: source?._id ? String(source._id) : undefined,
    name: source?.name,
    coverImageUrl: source?.coverImageUrl,
    category: source?.category,
    subcategory: source?.subcategory,
    itemType: source?.itemType,
    pageCount: pages.length,
    pages,
  }
}

async function loadSourcesByIds(ids: string[]): Promise<Map<string, LoadedSource>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))]
  const sourceMap = new Map<string, LoadedSource>()

  if (uniqueIds.length === 0) return sourceMap

  const [contents, templates, deletedContentSnapshots, deletedTemplateSnapshots] = await Promise.all([
    Content.find({ _id: { $in: uniqueIds } }).lean(),
    Template.find({ _id: { $in: uniqueIds } }).lean(),
    DeletedContentSnapshot.find({ sourceContentId: { $in: uniqueIds } }).lean(),
    DeletedTemplateSnapshot.find({ sourceTemplateId: { $in: uniqueIds } }).lean(),
  ])

  contents.forEach((content: any) => {
    sourceMap.set(String(content._id), {
      source: toSourceDocument(content),
      isSourceDeleted: false,
    })
  })

  templates.forEach((template: any) => {
    const key = String(template._id)
    if (sourceMap.has(key)) return
    sourceMap.set(key, {
      source: toSourceDocument(template),
      isSourceDeleted: false,
    })
  })

  deletedContentSnapshots.forEach((snapshot: any) => {
    const key = String(snapshot.sourceContentId)
    if (sourceMap.has(key)) return
    sourceMap.set(key, {
      source: toSourceDocument(snapshot.snapshot),
      isSourceDeleted: true,
    })
  })

  deletedTemplateSnapshots.forEach((snapshot: any) => {
    const key = String(snapshot.sourceTemplateId)
    if (sourceMap.has(key)) return
    sourceMap.set(key, {
      source: toSourceDocument(snapshot.snapshot),
      isSourceDeleted: true,
    })
  })

  return sourceMap
}

function buildJournalResponse(journal: any, loadedSource?: LoadedSource | null) {
  if (!loadedSource?.source) return null

  const source = loadedSource.source
  const copyLabel = (journal.copyNumber ?? 0) === 0
    ? source.name
    : `${source.name} - Copy ${journal.copyNumber}`

  return {
    _id: journal._id,
    templateId: journal.templateId,
    copyNumber: journal.copyNumber ?? 0,
    copyLabel,
    pageOrder: journal.pageOrder,
    updatedAt: journal.updatedAt,
    createdAt: journal.createdAt,
    isSourceDeleted: loadedSource.isSourceDeleted,
    content: {
      _id: source._id,
      name: source.name,
      coverImageUrl: source.coverImageUrl,
      category: source.category,
      subcategory: source.subcategory,
      itemType: source.itemType,
      pageCount: source.pageCount ?? 0,
    },
  }
}

function sanitizeDrawingPaths(input: any): SyncedDrawingPath[] {
  if (!Array.isArray(input)) return []

  return input
    .slice(-MAX_SYNC_DRAWING_PATHS)
    .map((path) => ({
      d: typeof path?.d === 'string' ? path.d : '',
      color: typeof path?.color === 'string' ? path.color : '#000000',
      width: Number.isFinite(path?.width) ? Number(path.width) : 1,
      opacity: Number.isFinite(path?.opacity) ? Number(path.opacity) : undefined,
    }))
    .filter((path) => path.d)
}

function sanitizePageElements(input: any): unknown[] {
  if (!Array.isArray(input)) return []
  return input.slice(0, MAX_SYNC_PAGE_ELEMENTS)
}

function sanitizeJournalDrawingPaths(input: any): SyncedDrawingPath[] {
  if (!Array.isArray(input)) return []

  return input
    .slice(-MAX_SYNC_JOURNAL_DRAWING_PATHS)
    .map((path) => ({
      d: typeof path?.d === 'string' ? path.d : '',
      color: typeof path?.color === 'string' ? path.color : '#000000',
      width: Number.isFinite(path?.width) ? Number(path.width) : 1,
      opacity: Number.isFinite(path?.opacity) ? Number(path.opacity) : undefined,
    }))
    .filter((path) => path.d)
}

function sanitizeJournalPageElements(input: any): unknown[] {
  if (!Array.isArray(input)) return []
  return input.slice(0, MAX_SYNC_JOURNAL_PAGE_ELEMENTS)
}

function sanitizeJournalPages(input: any): Array<{
  pageId: string
  sourcePageId?: string
  name: string
  background: string
  pageWidth: number
  pageHeight: number
  elements: unknown[]
  drawingPaths: SyncedDrawingPath[]
  updatedAt: Date
}> {
  if (!Array.isArray(input)) return []

  return input
    .slice(0, MAX_SYNC_JOURNAL_PAGES)
    .map((page) => ({
      pageId: typeof page?.pageId === 'string' ? page.pageId : '',
      sourcePageId: typeof page?.sourcePageId === 'string' ? page.sourcePageId : undefined,
      name: typeof page?.name === 'string' ? page.name : 'Page',
      background: typeof page?.background === 'string' ? page.background : '#ffffff',
      pageWidth: Number.isFinite(page?.pageWidth) ? Number(page.pageWidth) : 595,
      pageHeight: Number.isFinite(page?.pageHeight) ? Number(page.pageHeight) : 842,
      elements: sanitizeJournalPageElements(page?.elements),
      drawingPaths: sanitizeJournalDrawingPaths(page?.drawingPaths),
      updatedAt: page?.updatedAt ? new Date(page.updatedAt) : new Date(),
    }))
    .filter((page) => page.pageId)
}

router.get('/mine', requireAuth, updateLastActive, async (req, res) => {
  try {
    const userId = req.user!.id
    const journals = await Journal.find({ userId }).sort({ updatedAt: -1 }).lean()
    const sourceMap = await loadSourcesByIds(journals.map((journal: any) => String(journal.templateId)))

    const enriched = journals
      .map((journal: any) => buildJournalResponse(journal, sourceMap.get(String(journal.templateId))))
      .filter(Boolean)

    res.json({ success: true, data: enriched })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.get('/recent-pages', requireAuth, updateLastActive, async (req, res) => {
  try {
    const userId = req.user!.id
    const journals = await Journal.find({
      userId,
      'recentPageActivity.0': { $exists: true },
    }).lean()
    const sourceMap = await loadSourcesByIds(journals.map((journal: any) => String(journal.templateId)))

    const pages = journals
      .flatMap((journal: any) => {
        const loadedSource = sourceMap.get(String(journal.templateId))
        if (!loadedSource?.source) return []

        const source = loadedSource.source
        const activity = Array.isArray(journal.recentPageActivity) ? journal.recentPageActivity : []

        return activity.map((entry: any) => ({
          journalId: String(journal._id),
          templateId: journal.templateId,
          copyNumber: journal.copyNumber ?? 0,
          templateName: source.name,
          templateCoverImageUrl: source.coverImageUrl,
          subcategory: source.subcategory,
          isSourceDeleted: loadedSource.isSourceDeleted,
          pageIndex: entry.pageIndex ?? 0,
          localIndex: entry.localIndex ?? 0,
          pageId: entry.pageId,
          pageName: entry.pageName,
          pageBackground: entry.pageBackground,
          pageElements: Array.isArray(entry.pageElements) ? entry.pageElements : [],
          drawingPaths: Array.isArray(entry.drawingPaths) ? entry.drawingPaths : [],
          pageWidth: entry.pageWidth ?? 595,
          pageHeight: entry.pageHeight ?? 842,
          updatedAt: entry.updatedAt ?? journal.updatedAt,
        }))
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 8)

    res.json({ success: true, data: pages })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.put('/recent-page', requireAuth, updateLastActive, async (req, res) => {
  try {
    const userId = req.user!.id
    const {
      journalId,
      templateId,
      pageId,
      pageIndex,
      localIndex,
      pageName,
      pageBackground,
      pageWidth,
      pageHeight,
      pageElements,
      drawingPaths,
    } = req.body ?? {}

    if (!pageId || pageIndex === undefined || localIndex === undefined) {
      res.status(400).json({ success: false, message: 'pageId, pageIndex, and localIndex are required' })
      return
    }

    let journal = journalId
      ? await Journal.findOne({ _id: journalId, userId })
      : null

    if (!journal && templateId) {
      journal = await Journal.findOneAndUpdate(
        { userId, templateId, copyNumber: 0 },
        { userId, templateId, copyNumber: 0, $setOnInsert: { pageOrder: [] } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      )
    }

    if (!journal) {
      res.status(404).json({ success: false, message: 'Journal not found' })
      return
    }

    const nextEntry = {
      pageId: String(pageId),
      pageIndex: Number(pageIndex),
      localIndex: Number(localIndex),
      pageName: typeof pageName === 'string' ? pageName : `Page ${Number(localIndex) + 1}`,
      pageBackground: typeof pageBackground === 'string' ? pageBackground : '#ffffff',
      pageWidth: Number.isFinite(pageWidth) ? Number(pageWidth) : 595,
      pageHeight: Number.isFinite(pageHeight) ? Number(pageHeight) : 842,
      pageElements: sanitizePageElements(pageElements),
      drawingPaths: sanitizeDrawingPaths(drawingPaths),
      updatedAt: new Date(),
    }

    const existingActivity = Array.isArray(journal.recentPageActivity) ? journal.recentPageActivity : []
    journal.recentPageActivity = [
      nextEntry,
      ...existingActivity.filter((entry: any) => entry.pageId !== nextEntry.pageId),
    ]
      .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, MAX_RECENT_PAGE_ACTIVITY)

    await journal.save()

    res.json({ success: true, data: { journalId: String(journal._id) } })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.get('/for-template/:templateId', requireAuth, updateLastActive, async (req, res) => {
  try {
    const userId = req.user!.id
    const { templateId } = req.params
    const journals = await Journal.find({ userId, templateId }).sort({ copyNumber: 1 }).lean()
    const sourceMap = await loadSourcesByIds([templateId])

    const enriched = journals
      .map((journal: any) => buildJournalResponse(journal, sourceMap.get(String(journal.templateId))))
      .filter(Boolean)

    res.json({ success: true, data: enriched, copyCount: journals.filter(j => (j.copyNumber ?? 0) > 0).length })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.post('/create-copy', requireAuth, updateLastActive, async (req, res) => {
  try {
    const userId = req.user!.id
    const { templateId, pageOrder } = req.body
    if (!templateId || !Array.isArray(pageOrder)) {
      res.status(400).json({ success: false, message: 'templateId and pageOrder[] are required' })
      return
    }

    const primaryContent = await findContentById(templateId)
    if (!primaryContent) {
      const contentSnapshot = await DeletedContentSnapshot.findOne({ sourceContentId: templateId }).lean()
      const templateSnapshot = contentSnapshot
        ? contentSnapshot
        : await DeletedTemplateSnapshot.findOne({ sourceTemplateId: templateId }).lean()

      if (contentSnapshot || templateSnapshot) {
        res.status(410).json({
          success: false,
          code: 'SOURCE_CONTENT_DELETED',
          message:
            'This journal can no longer be copied because its underlying content has been permanently removed by an administrator.',
        })
        return
      }
      res.status(404).json({ success: false, message: 'Source content not found.' })
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
      pageOrder: pageOrder as PageOrderRef[],
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

router.get('/', requireAuth, updateLastActive, async (req, res) => {
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
    const { templateId, pageOrder, journalId, pages } = req.body
    if (!Array.isArray(pageOrder)) {
      res.status(400).json({ success: false, message: 'pageOrder[] is required' })
      return
    }

    const nextPages = pages === undefined ? undefined : sanitizeJournalPages(pages)

    if (journalId) {
      const journal = await Journal.findOneAndUpdate(
        { _id: journalId, userId },
        {
          pageOrder: pageOrder as PageOrderRef[],
          ...(nextPages !== undefined ? { pages: nextPages } : {}),
        },
        { returnDocument: 'after' }
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
      {
        userId,
        templateId,
        copyNumber: 0,
        pageOrder: pageOrder as PageOrderRef[],
        ...(nextPages !== undefined ? { pages: nextPages } : {}),
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ).lean()
    res.json({ success: true, data: journal })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id
    const { id } = req.params
    const deleted = await Journal.findOneAndDelete({ _id: id, userId }).lean()
    if (!deleted) {
      res.status(404).json({ success: false, message: 'Journal not found' })
      return
    }
    res.json({ success: true, data: { _id: id } })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

export default router
