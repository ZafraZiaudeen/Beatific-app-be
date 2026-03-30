import { CalendarSchedule, type ICalendarSchedule } from '../domain/models/CalendarSchedule'
import { Content, type IContent } from '../domain/models/Content'
import { Journal, type IJournalPage } from '../domain/models/Journal'
import { User } from '../domain/models/User'
import { DeletedContentSnapshot } from '../domain/models/DeletedContentSnapshot'
import { DeletedTemplateSnapshot } from '../domain/models/DeletedTemplateSnapshot'

const DAY_MS = 24 * 60 * 60 * 1000
const ROLLING_HORIZON_DAYS = 90
const SLOT_SORT_ORDER: Record<string, number> = {
  morning: 1,
  afternoon: 2,
  evening: 3,
  anytime: 4,
}

type SourceSummary = {
  _id?: string
  name?: string
  coverImageUrl?: string
  category?: string
  subcategory?: string
  itemType?: string
  pageCount?: number
}

function toUtcDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`)
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

function addMonths(date: Date, months: number): Date {
  const copy = new Date(date.getTime())
  copy.setUTCMonth(copy.getUTCMonth() + months)
  return copy
}

function startOfTodayUtc(): Date {
  return toUtcDate(toDateStr(new Date()))
}

function isSchedulableContent(content: IContent | null | undefined): content is IContent {
  if (!content) return false
  const type = String(content.itemType || '').toLowerCase()
  return content.isPublished && type !== 'sticker' && type !== 'page'
}

function normalizeWeekdays(weekdays?: string[]): string[] {
  const unique = new Set((weekdays ?? []).map((day) => String(day).trim().toLowerCase()).filter(Boolean))
  return Array.from(unique)
}

function getWeekdayName(date: Date): string {
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getUTCDay()]
}

function buildJournalPagesFromContent(content: IContent): IJournalPage[] {
  return (content.pages ?? []).map((page) => ({
    pageId: page.id,
    sourcePageId: page.id,
    name: page.name,
    background: page.background ?? '#ffffff',
    pageWidth: page.width ?? 595,
    pageHeight: page.height ?? 842,
    elements: Array.isArray(page.elements) ? page.elements : [],
    drawingPaths: [],
    updatedAt: new Date(),
  }))
}

function buildJournalSeed(args: {
  userId: string
  content: IContent
  calendarDate?: string
  scheduleId?: string
  sourceKind: 'template' | 'scheduled' | 'manual-date'
  slotLabel?: string
  startTime?: string
  scheduleRevisionApplied?: number
}) {
  const pages = buildJournalPagesFromContent(args.content)
  return {
    userId: args.userId,
    templateId: String(args.content._id),
    copyNumber: 0,
    calendarDate: args.calendarDate,
    scheduleId: args.scheduleId,
    sourceKind: args.sourceKind,
    slotLabel: args.slotLabel,
    startTime: args.startTime,
    hasUserEdits: false,
    scheduleRevisionApplied: args.scheduleRevisionApplied,
    pageOrder: pages.map((page) => page.pageId),
    pages,
  }
}

function listOccurrences(
  schedule: Pick<ICalendarSchedule, 'mode' | 'exactDate' | 'recurrence'>,
  options?: { from?: string; to?: string; max?: number }
): string[] {
  const from = options?.from ? toUtcDate(options.from) : startOfTodayUtc()
  const to = options?.to ? toUtcDate(options.to) : addDays(from, ROLLING_HORIZON_DAYS - 1)
  const max = options?.max ?? 120

  if (schedule.mode === 'exact') {
    if (!schedule.exactDate) return []
    const exact = toUtcDate(schedule.exactDate)
    if (exact < from || exact > to) return []
    return [schedule.exactDate]
  }

  if (!schedule.recurrence?.startDate) return []

  const recurrence = schedule.recurrence
  const start = toUtcDate(recurrence.startDate)
  const end = recurrence.endDate ? toUtcDate(recurrence.endDate) : to
  const windowStart = from > start ? from : start
  const windowEnd = end < to ? end : to
  if (windowEnd < windowStart) return []

  const interval = Math.max(1, recurrence.interval || 1)
  const results: string[] = []

  if (recurrence.frequency === 'daily') {
    for (let cursor = windowStart; cursor <= windowEnd && results.length < max; cursor = addDays(cursor, 1)) {
      const diffDays = Math.floor((cursor.getTime() - start.getTime()) / DAY_MS)
      if (diffDays >= 0 && diffDays % interval === 0) {
        results.push(toDateStr(cursor))
      }
    }
    return results
  }

  if (recurrence.frequency === 'weekly') {
    const weekdays = normalizeWeekdays(recurrence.weekdays)
    if (weekdays.length === 0) return []
    for (let cursor = windowStart; cursor <= windowEnd && results.length < max; cursor = addDays(cursor, 1)) {
      const diffDays = Math.floor((cursor.getTime() - start.getTime()) / DAY_MS)
      if (diffDays < 0) continue
      const diffWeeks = Math.floor(diffDays / 7)
      if (diffWeeks % interval !== 0) continue
      if (weekdays.includes(getWeekdayName(cursor))) {
        results.push(toDateStr(cursor))
      }
    }
    return results
  }

  const dayOfMonth = Math.max(1, Math.min(31, recurrence.dayOfMonth || start.getUTCDate()))
  const anchorMonth = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)
  let cursor = new Date(Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth(), 1))
  while (cursor <= windowEnd && results.length < max) {
    const monthIndex =
      (cursor.getUTCFullYear() - new Date(anchorMonth).getUTCFullYear()) * 12 +
      (cursor.getUTCMonth() - new Date(anchorMonth).getUTCMonth())
    if (monthIndex >= 0 && monthIndex % interval === 0) {
      const daysInMonth = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate()
      const candidate = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), Math.min(dayOfMonth, daysInMonth)))
      if (candidate >= windowStart && candidate >= start && candidate <= windowEnd) {
        results.push(toDateStr(candidate))
      }
    }
    cursor = addMonths(cursor, 1)
  }

  return results
}

async function findSourceSummaries(ids: string[]): Promise<Map<string, SourceSummary>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))]
  const result = new Map<string, SourceSummary>()
  if (!uniqueIds.length) return result

  const [contents, deletedContents, deletedTemplates] = await Promise.all([
    Content.find({ _id: { $in: uniqueIds } }).lean(),
    DeletedContentSnapshot.find({ sourceContentId: { $in: uniqueIds } }).lean(),
    DeletedTemplateSnapshot.find({ sourceTemplateId: { $in: uniqueIds } }).lean(),
  ])

  contents.forEach((content: any) => {
    result.set(String(content._id), {
      _id: String(content._id),
      name: content.name,
      coverImageUrl: content.coverImageUrl,
      category: content.category,
      subcategory: content.subcategory,
      itemType: content.itemType,
      pageCount: Array.isArray(content.pages) ? content.pages.length : 0,
    })
  })

  deletedContents.forEach((snapshot: any) => {
    const key = String(snapshot.sourceContentId)
    if (result.has(key)) return
    const source = snapshot.snapshot ?? {}
    result.set(key, {
      _id: key,
      name: source.name,
      coverImageUrl: source.coverImageUrl,
      category: source.category,
      subcategory: source.subcategory,
      itemType: source.itemType,
      pageCount: Array.isArray(source.pages) ? source.pages.length : 0,
    })
  })

  deletedTemplates.forEach((snapshot: any) => {
    const key = String(snapshot.sourceTemplateId)
    if (result.has(key)) return
    const source = snapshot.snapshot ?? {}
    result.set(key, {
      _id: key,
      name: source.name,
      coverImageUrl: source.coverImageUrl,
      category: source.category,
      subcategory: source.subcategory,
      itemType: source.itemType,
      pageCount: Array.isArray(source.pages) ? source.pages.length : 0,
    })
  })

  return result
}

function sortCalendarItems<T extends { startTime?: string; slotLabel?: string; createdAt?: Date | string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTime = a.startTime || '99:99'
    const bTime = b.startTime || '99:99'
    if (aTime !== bTime) return aTime.localeCompare(bTime)

    const aSlot = SLOT_SORT_ORDER[String(a.slotLabel || '').trim().toLowerCase()] ?? 99
    const bSlot = SLOT_SORT_ORDER[String(b.slotLabel || '').trim().toLowerCase()] ?? 99
    if (aSlot !== bSlot) return aSlot - bSlot

    const aCreated = new Date(a.createdAt ?? 0).getTime()
    const bCreated = new Date(b.createdAt ?? 0).getTime()
    return aCreated - bCreated
  })
}

async function materializeScheduleForUsers(schedule: ICalendarSchedule, userIds: string[]): Promise<void> {
  const scheduleId = String(schedule._id)
  const content = await Content.findById(schedule.contentId)
  if (!isSchedulableContent(content)) return

  const today = toDateStr(startOfTodayUtc())
  const activeDates = schedule.isActive
    ? new Set(listOccurrences(schedule, { from: today, to: toDateStr(addDays(startOfTodayUtc(), ROLLING_HORIZON_DAYS - 1)) }))
    : new Set<string>()

  const existing = await Journal.find({ scheduleId }).lean()
  const existingMap = new Map(existing.map((journal: any) => [`${journal.userId}:${journal.calendarDate}`, journal]))

  for (const journal of existing) {
    const journalDate = String((journal as any).calendarDate || '')
    const shouldKeep = activeDates.has(journalDate)
    const isFutureOrToday = !!journalDate && journalDate >= today
    if (!shouldKeep && !(journal as any).hasUserEdits && isFutureOrToday) {
      await Journal.deleteOne({ _id: (journal as any)._id })
      existingMap.delete(`${(journal as any).userId}:${journalDate}`)
    }
  }

  if (!schedule.isActive) return

  for (const userId of userIds) {
    for (const date of activeDates) {
      const key = `${userId}:${date}`
      const current = existingMap.get(key)
      if (current) {
        if ((current as any).hasUserEdits) continue
        const seed = buildJournalSeed({
          userId,
          content,
          calendarDate: date,
          scheduleId,
          sourceKind: 'scheduled',
          slotLabel: schedule.slotLabel,
          startTime: schedule.startTime,
          scheduleRevisionApplied: schedule.revision,
        })
        await Journal.updateOne(
          { _id: (current as any)._id },
          {
            $set: {
              templateId: seed.templateId,
              sourceKind: seed.sourceKind,
              slotLabel: seed.slotLabel,
              startTime: seed.startTime,
              pageOrder: seed.pageOrder,
              pages: seed.pages,
              scheduleRevisionApplied: seed.scheduleRevisionApplied,
            },
          }
        )
        continue
      }

      await Journal.create(
        buildJournalSeed({
          userId,
          content,
          calendarDate: date,
          scheduleId,
          sourceKind: 'scheduled',
          slotLabel: schedule.slotLabel,
          startTime: schedule.startTime,
          scheduleRevisionApplied: schedule.revision,
        })
      )
    }
  }
}

export async function ensureUserCalendarBackfill(userId: string): Promise<void> {
  const schedules = await CalendarSchedule.find({ isActive: true }).lean()
  if (!schedules.length) return
  for (const schedule of schedules) {
    await materializeScheduleForUsers(schedule as ICalendarSchedule, [userId])
  }
}

export async function materializeScheduleForAllUsers(schedule: ICalendarSchedule): Promise<void> {
  const users = await User.find({}, { _id: 1 }).lean()
  await materializeScheduleForUsers(schedule, users.map((user: any) => String(user._id)))
}

export async function pruneScheduleMaterialization(scheduleId: string): Promise<void> {
  const today = toDateStr(startOfTodayUtc())
  await Journal.deleteMany({
    scheduleId,
    calendarDate: { $gte: today },
    hasUserEdits: false,
  })
}

export async function refreshSchedulesForContent(contentId: string): Promise<void> {
  const schedules = await CalendarSchedule.find({ contentId, isActive: true }).lean()
  for (const schedule of schedules) {
    await materializeScheduleForAllUsers(schedule as ICalendarSchedule)
  }
}

export async function createManualDateJournal(args: {
  userId: string
  calendarDate: string
  contentId: string
  slotLabel?: string
  startTime?: string
}) {
  const content = await Content.findById(args.contentId)
  if (!isSchedulableContent(content)) {
    const err: any = new Error('Content is not available for date planning.')
    err.statusCode = 400
    throw err
  }

  const created = await Journal.create(
    buildJournalSeed({
      userId: args.userId,
      content,
      calendarDate: args.calendarDate,
      sourceKind: 'manual-date',
      slotLabel: args.slotLabel,
      startTime: args.startTime,
    })
  )

  return created.toObject()
}

export async function getCalendarMonth(userId: string, month: string) {
  await ensureUserCalendarBackfill(userId)
  const docs = await Journal.find({
    userId,
    calendarDate: { $regex: `^${month}-` },
  }).lean()

  const sourceMap = await findSourceSummaries(docs.map((doc: any) => String(doc.templateId)))
  const grouped = new Map<string, any[]>()

  docs.forEach((doc: any) => {
    const date = String(doc.calendarDate || '')
    if (!date) return
    const list = grouped.get(date) ?? []
    list.push({
      journalId: String(doc._id),
      contentId: String(doc.templateId),
      sourceKind: doc.sourceKind ?? 'template',
      slotLabel: doc.slotLabel,
      startTime: doc.startTime,
      hasUserEdits: !!doc.hasUserEdits,
      createdAt: doc.createdAt,
      content: sourceMap.get(String(doc.templateId)) ?? { _id: String(doc.templateId), name: 'Untitled' },
    })
    grouped.set(date, list)
  })

  const dates = Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      count: items.length,
      items: sortCalendarItems(items).slice(0, 4),
    }))

  return { month, dates }
}

export async function getCalendarDate(userId: string, calendarDate: string) {
  await ensureUserCalendarBackfill(userId)
  const docs = await Journal.find({ userId, calendarDate }).lean()
  const sourceMap = await findSourceSummaries(docs.map((doc: any) => String(doc.templateId)))

  const items = sortCalendarItems(
    docs.map((doc: any) => ({
      journalId: String(doc._id),
      contentId: String(doc.templateId),
      scheduleId: doc.scheduleId,
      calendarDate: doc.calendarDate,
      sourceKind: doc.sourceKind ?? 'template',
      slotLabel: doc.slotLabel,
      startTime: doc.startTime,
      hasUserEdits: !!doc.hasUserEdits,
      scheduleRevisionApplied: doc.scheduleRevisionApplied,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      content: sourceMap.get(String(doc.templateId)) ?? { _id: String(doc.templateId), name: 'Untitled' },
    }))
  )

  return { date: calendarDate, items }
}

export function listUpcomingOccurrences(
  schedule: Pick<ICalendarSchedule, 'mode' | 'exactDate' | 'recurrence'>,
  max = 12
) {
  return listOccurrences(schedule, { max })
}

export function didJournalMeaningfullyChange(existing: any, next: { pageOrder: Array<number | string>; pages?: unknown[] }) {
  const beforeOrder = JSON.stringify(existing?.pageOrder ?? [])
  const afterOrder = JSON.stringify(next.pageOrder ?? [])
  if (beforeOrder !== afterOrder) return true

  if (next.pages !== undefined) {
    const beforePages = JSON.stringify(existing?.pages ?? [])
    const afterPages = JSON.stringify(next.pages ?? [])
    if (beforePages !== afterPages) return true
  }

  return false
}
