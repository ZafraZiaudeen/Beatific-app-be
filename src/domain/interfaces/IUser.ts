import { Document } from 'mongoose'

export interface IFavoriteEntry {
  itemId: string
  itemType: 'template' | 'sticker' | 'content'
  addedAt: Date
}

export interface IUser extends Document {
  name: string
  email: string
  password: string
  role?: string
  avatar?: string
  bio?: string
  isBanned?: boolean
  lastActiveAt?: Date
  favorites?: IFavoriteEntry[]
  createdAt: Date
  updatedAt: Date
}
