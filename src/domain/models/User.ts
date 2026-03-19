import { Schema, model } from 'mongoose'
import { IUser } from '../interfaces/IUser'

const FavoriteSchema = new Schema(
  {
    itemId:   { type: String, required: true },
    itemType: { type: String, required: true, enum: ['template', 'sticker', 'content'] },
    addedAt:  { type: Date, default: Date.now },
  },
  { _id: false }
)

const UserSchema = new Schema<IUser>(
  {
    name:     { type: String, required: true, trim: true },
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    avatar:   { type: String },
    bio:      { type: String, maxlength: 300 },
    role:     { type: String, enum: ['admin', 'super_admin', 'user'], default: 'admin' },
    isBanned: { type: Boolean, default: false },
    lastActiveAt: { type: Date },
    favorites: { type: [FavoriteSchema], default: [] },
  },
  { timestamps: true }
)

export const User = model<IUser>('AppUser', UserSchema)
