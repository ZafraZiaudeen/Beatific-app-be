import { Schema, model } from 'mongoose'

export interface IJournalDrawingPath {
  d: string
  color: string
  width: number
  opacity?: number
}

export interface IJournalRecentPageActivity {
  pageId: string
  pageIndex: number
  localIndex: number
  pageName: string
  pageBackground: string
  pageWidth: number
  pageHeight: number
  pageElements: unknown[]
  drawingPaths: IJournalDrawingPath[]
  updatedAt: Date
}

export interface IJournalPage {
  pageId: string
  sourcePageId?: string
  name: string
  background: string
  pageWidth: number
  pageHeight: number
  elements: unknown[]
  drawingPaths: IJournalDrawingPath[]
  updatedAt: Date
}

export interface IJournal {
  _id?: string
  userId: string
  templateId: string
  copyNumber: number
  pageOrder: Array<number | string>
  pages?: IJournalPage[]
  recentPageActivity?: IJournalRecentPageActivity[]
  createdAt?: Date
  updatedAt?: Date
}

const DrawingPathSchema = new Schema<IJournalDrawingPath>(
  {
    d: { type: String, required: true },
    color: { type: String, required: true },
    width: { type: Number, required: true },
    opacity: Number,
  },
  { _id: false }
)

const RecentPageActivitySchema = new Schema<IJournalRecentPageActivity>(
  {
    pageId: { type: String, required: true },
    pageIndex: { type: Number, required: true },
    localIndex: { type: Number, required: true },
    pageName: { type: String, required: true },
    pageBackground: { type: String, required: true },
    pageWidth: { type: Number, required: true },
    pageHeight: { type: Number, required: true },
    pageElements: { type: [Schema.Types.Mixed], default: [] },
    drawingPaths: { type: [DrawingPathSchema], default: [] },
    updatedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
)

const JournalPageSchema = new Schema<IJournalPage>(
  {
    pageId: { type: String, required: true },
    sourcePageId: String,
    name: { type: String, required: true },
    background: { type: String, required: true },
    pageWidth: { type: Number, required: true },
    pageHeight: { type: Number, required: true },
    elements: { type: [Schema.Types.Mixed], default: [] },
    drawingPaths: { type: [DrawingPathSchema], default: [] },
    updatedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
)

const JournalSchema = new Schema<IJournal>(
  {
    userId: { type: String, required: true, index: true },
    templateId: { type: String, required: true },
    copyNumber: { type: Number, required: true, default: 0 },
    pageOrder: { type: [Schema.Types.Mixed], required: true },
    pages: { type: [JournalPageSchema], default: [] },
    recentPageActivity: { type: [RecentPageActivitySchema], default: [] },
  },
  { timestamps: true }
)

JournalSchema.index({ userId: 1, templateId: 1, copyNumber: 1 }, { unique: true })
JournalSchema.index({ userId: 1, updatedAt: -1 })

export const Journal = model<IJournal>('Journal', JournalSchema)

export async function migrateJournals() {
  try {
    await Journal.updateMany(
      { copyNumber: { $exists: false } },
      { $set: { copyNumber: 0 } }
    )
    await Journal.updateMany(
      { recentPageActivity: { $exists: false } },
      { $set: { recentPageActivity: [] } }
    )
    await Journal.updateMany(
      { pages: { $exists: false } },
      { $set: { pages: [] } }
    )
    await Journal.collection.dropIndex('userId_1_templateId_1').catch((err: any) => {
      const msg = err && (err.codeName || err.code || err.message)
      if (!/IndexNotFound|index not found/i.test(String(msg))) {
        console.warn('migrateJournals: dropIndex warning', err)
      }
    })
  } catch (err: any) {
    console.warn('migrateJournals: migration skipped or failed', err)
  }
}
