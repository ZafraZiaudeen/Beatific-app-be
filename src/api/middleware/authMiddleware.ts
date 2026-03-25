import { User } from '../../domain/models/User'

export async function updateLastActive(req: Request, res: Response, next: NextFunction) {
  if (req.user && req.user.id) {
    try {
      await User.findByIdAndUpdate(req.user.id, { lastActiveAt: new Date() })
    } catch (err) {
      console.warn('Failed to update lastActiveAt:', err)
    }
  }
  next()
}
import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import type { AuthPayload } from '../../domain/interfaces/IAuth'

const JWT_SECRET = process.env.JWT_SECRET ?? 'beatific-user-secret-change-in-production'

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'No token provided' })
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload
    req.user = decoded
    next()
  } catch {
    res.status(401).json({ success: false, message: 'Token is invalid or expired' })
  }
}
