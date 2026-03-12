import { Router } from 'express'
import { authService } from '../../application/authService'
import { requireAuth } from '../middleware/authMiddleware'

const router = Router()

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body
    if (!name || !email || !password) {
      res.status(400).json({ success: false, message: 'name, email and password are required' })
      return
    }
    const data = await authService.register({ name, email, password })
    res.status(201).json({ success: true, data })
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ success: false, message: err.message })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      res.status(400).json({ success: false, message: 'email and password are required' })
      return
    }
    const data = await authService.login({ email, password })
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ success: false, message: err.message })
  }
})

router.get('/me', requireAuth, async (req, res) => {
  try {
    const profile = await authService.getProfile(req.user!.id)
    res.json({ success: true, data: profile })
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ success: false, message: err.message })
  }
})

router.patch('/me', requireAuth, async (req, res) => {
  try {
    const { name, avatar, bio } = req.body
    const updated = await authService.updateProfile(req.user!.id, { name, avatar, bio })
    res.json({ success: true, data: updated })
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ success: false, message: err.message })
  }
})

router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, message: 'currentPassword and newPassword are required' })
      return
    }
    await authService.changePassword(req.user!.id, currentPassword, newPassword)
    res.json({ success: true, message: 'Password changed successfully' })
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ success: false, message: err.message })
  }
})

router.delete('/me', requireAuth, async (req, res) => {
  try {
    await authService.deleteAccount(req.user!.id)
    res.json({ success: true, message: 'Account deleted successfully' })
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ success: false, message: err.message })
  }
})

export default router
