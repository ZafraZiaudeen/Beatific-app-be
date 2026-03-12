import { Document } from 'mongoose'

export interface IUser extends Document {
  name: string
  email: string
  password: string
  avatar?: string
  bio?: string
  isBanned?: boolean
  lastActiveAt?: Date
  createdAt: Date
  updatedAt: Date
}
