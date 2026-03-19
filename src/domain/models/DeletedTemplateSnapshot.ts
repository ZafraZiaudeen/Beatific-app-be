import { Schema, model, Document } from 'mongoose'


export interface IDeletedTemplateSnapshot extends Document {
  sourceTemplateId: string
  snapshot: Record<string, unknown>
  deletedAt: Date
  deletedBy?: string
  journalRefCount: number
}

const DeletedTemplateSnapshotSchema = new Schema<IDeletedTemplateSnapshot>(
  {
    sourceTemplateId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    snapshot: {
      type: Schema.Types.Mixed,
      required: true,
    },
    deletedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    deletedBy: {
      type: String,
    },
    journalRefCount: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { timestamps: false }
)

export const DeletedTemplateSnapshot = model<IDeletedTemplateSnapshot>(
  'DeletedTemplateSnapshot',
  DeletedTemplateSnapshotSchema,
)
