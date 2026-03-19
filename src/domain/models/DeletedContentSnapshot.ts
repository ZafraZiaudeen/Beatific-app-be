import { Schema, model, Document } from 'mongoose'



export interface IDeletedContentSnapshot extends Document {
  sourceContentId: string
  snapshot: Record<string, unknown>
  deletedAt: Date
  deletedBy?: string
  journalRefCount: number
}

const DeletedContentSnapshotSchema = new Schema<IDeletedContentSnapshot>(
  {
    sourceContentId: {
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

export const DeletedContentSnapshot = model<IDeletedContentSnapshot>(
  'DeletedContentSnapshot',
  DeletedContentSnapshotSchema,
)
