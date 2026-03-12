import { Schema, model } from 'mongoose'

export interface IJournal {
  _id?: string
  userId: string
  templateId: string
  copyNumber: number       
  pageOrder: number[]   
  createdAt?: Date
  updatedAt?: Date
}

const JournalSchema = new Schema<IJournal>(
  {
    userId:     { type: String, required: true, index: true },
    templateId: { type: String, required: true },
    copyNumber: { type: Number, required: true, default: 0 },
    pageOrder:  { type: [Number], required: true },
  },
  { timestamps: true }
)

// One customization per user per template per copyNumber
JournalSchema.index({ userId: 1, templateId: 1, copyNumber: 1 }, { unique: true })

export const Journal = model<IJournal>('Journal', JournalSchema)

// Migration: drop old unique index and set copyNumber=0 for existing docs
export async function migrateJournals() {
  try {
    // Set copyNumber=0 on any docs missing it
    await Journal.updateMany(
      { copyNumber: { $exists: false } },
      { $set: { copyNumber: 0 } }
    )
    // Drop old index if it exists
    await Journal.collection.dropIndex('userId_1_templateId_1').catch(() => {})
  } catch {
    // Migration already done or collection doesn't exist yet — fine
  }
}
