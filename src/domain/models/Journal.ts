import { Schema, model } from 'mongoose'

export interface IJournal {
  _id?: string
  userId: string
  templateId: string
  copyNumber: number       
  pageOrder: Array<number | string>
  createdAt?: Date
  updatedAt?: Date
}

const JournalSchema = new Schema<IJournal>(
  {
    userId:     { type: String, required: true, index: true },
    templateId: { type: String, required: true },
    copyNumber: { type: Number, required: true, default: 0 },
    pageOrder:  { type: [Schema.Types.Mixed], required: true },
  },
  { timestamps: true }
)

JournalSchema.index({ userId: 1, templateId: 1, copyNumber: 1 }, { unique: true })

export const Journal = model<IJournal>('Journal', JournalSchema)

export async function migrateJournals() {
  try {
    await Journal.updateMany(
      { copyNumber: { $exists: false } },
      { $set: { copyNumber: 0 } }
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
