import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { User } from '../domain/models/User'
import type { IUser } from '../domain/interfaces/IUser'
import type { LoginCredentials, RegisterCredentials, AuthResponse } from '../domain/interfaces/IAuth'

const JWT_SECRET     = process.env.JWT_SECRET     ?? 'beatific-user-secret-change-in-production'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '30d'

export const authService = {
  async register(credentials: RegisterCredentials): Promise<AuthResponse> {
    const { name, email, password } = credentials

    const existing = await User.findOne({ email })
    if (existing) {
      const err: any = new Error('An account with this email already exists')
      err.statusCode = 409
      throw err
    }

    const hashed = await bcrypt.hash(password, 10)
    const user   = await User.create({ name, email, password: hashed })

    const token = jwt.sign(
      { id: user._id.toString(), email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    )

    return { _id: user._id.toString(), name: user.name, email: user.email, token }
  },

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const { email, password } = credentials

    const user = await User.findOne({ email })
    if (!user) {
      const err: any = new Error('Invalid email or password')
      err.statusCode = 401
      throw err
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      const err: any = new Error('Invalid email or password')
      err.statusCode = 401
      throw err
    }

    const token = jwt.sign(
      { id: user._id.toString(), email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    )

    await User.findByIdAndUpdate(user._id, { lastActiveAt: new Date() })

    return { _id: user._id.toString(), name: user.name, email: user.email, token }
  },

  async getProfile(userId: string): Promise<Omit<IUser, 'password'>> {
    const user = await User.findById(userId).select('-password')
    if (!user) {
      const err: any = new Error('User not found')
      err.statusCode = 404
      throw err
    }
    return user as Omit<IUser, 'password'>
  },

  async updateProfile(
    userId: string,
    data: { name?: string; avatar?: string; bio?: string }
  ): Promise<Omit<IUser, 'password'>> {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: data },
      { new: true, runValidators: true }
    ).select('-password')
    if (!user) {
      const err: any = new Error('User not found')
      err.statusCode = 404
      throw err
    }
    return user as Omit<IUser, 'password'>
  },

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await User.findById(userId)
    if (!user) {
      const err: any = new Error('User not found')
      err.statusCode = 404
      throw err
    }
    const isMatch = await bcrypt.compare(currentPassword, user.password)
    if (!isMatch) {
      const err: any = new Error('Current password is incorrect')
      err.statusCode = 400
      throw err
    }
    if (newPassword.length < 6) {
      const err: any = new Error('New password must be at least 6 characters')
      err.statusCode = 400
      throw err
    }
    const hashed = await bcrypt.hash(newPassword, 10)
    await User.findByIdAndUpdate(userId, { password: hashed })
  },

  async deleteAccount(userId: string): Promise<void> {
    const user = await User.findByIdAndDelete(userId)
    if (!user) {
      const err: any = new Error('User not found')
      err.statusCode = 404
      throw err
    }
  },
}
