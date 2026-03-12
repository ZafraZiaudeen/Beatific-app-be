import { Schema, model } from 'mongoose'

export interface IMainCategory {
  _id?: string
  name: string
  slug: string
  icon?: string
  color: string
  order: number
  createdAt?: Date
  updatedAt?: Date
}

const MainCategorySchema = new Schema<IMainCategory>(
  {
    name:  { type: String, required: true, trim: true },
    slug:  { type: String, required: true, trim: true, lowercase: true, unique: true },
    icon:  { type: String, default: '' },
    color: { type: String, default: 'stone' },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
)

export const MainCategory = model<IMainCategory>('MainCategory', MainCategorySchema)
