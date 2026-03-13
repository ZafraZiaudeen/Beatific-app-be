import { Router } from 'express'
import { authService } from '../../application/authService'
import { verificationService } from '../../application/verificationService'
import { requireAuth } from '../middleware/authMiddleware'

const router = Router()

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body
    if (!name || !email || !password) {
      res.status(400).json({ success: false, message: 'name, email and password are required' })
      return
    }
    const data = await verificationService.sendRegistrationCode(name, email.trim().toLowerCase(), password)
    res.status(200).json({ success: true, data })
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ success: false, message: err.message })
  }
})

router.post('/verify-registration', async (req, res) => {
  try {
    const { email, code } = req.body
    if (!email || !code) {
      res.status(400).json({ success: false, message: 'email and code are required' })
      return
    }
    const data = await verificationService.verifyRegistrationCode(email.trim().toLowerCase(), code.trim())
    res.status(201).json({ success: true, data })
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ success: false, message: err.message })
  }
})

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) {
      res.status(400).json({ success: false, message: 'email is required' })
      return
    }
    const data = await verificationService.sendForgotPasswordCode(email.trim().toLowerCase())
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ success: false, message: err.message })
  }
})

// ─── Forgot Password: Step 2 — verify code ────────────────
router.post('/verify-reset-code', async (req, res) => {
  try {
    const { email, code } = req.body
    if (!email || !code) {
      res.status(400).json({ success: false, message: 'email and code are required' })
      return
    }
    const data = await verificationService.verifyForgotPasswordCode(email.trim().toLowerCase(), code.trim())
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ success: false, message: err.message })
  }
})

// ─── Forgot Password: Step 3 — set new password ───────────
router.post('/reset-password', async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body
    if (!resetToken || !newPassword) {
      res.status(400).json({ success: false, message: 'resetToken and newPassword are required' })
      return
    }
    const data = await verificationService.resetPassword(resetToken, newPassword)
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ success: false, message: err.message })
  }
})

router.post('/resend-code', async (req, res) => {
  try {
    const { email, type } = req.body
    if (!email || !type) {
      res.status(400).json({ success: false, message: 'email and type are required' })
      return
    }
    if (!['registration', 'forgot_password'].includes(type)) {
      res.status(400).json({ success: false, message: 'type must be registration or forgot_password' })
      return
    }
    const data = await verificationService.resendCode(email.trim().toLowerCase(), type)
    res.json({ success: true, data })
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
    res.json({ success: true, data: {
      _id: (profile as any)._id?.toString() ?? req.user!.id,
      name: (profile as any).name,
      email: (profile as any).email,
      role: (profile as any).role ?? 'admin',
      avatar: (profile as any).avatar ?? null,
      bio: (profile as any).bio ?? null,
    }})
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ success: false, message: err.message })
  }
})

router.patch('/me', requireAuth, async (req, res) => {
  try {
    const { name, avatar, bio, email } = req.body
    const updated = await authService.updateProfile(req.user!.id, { name, avatar, bio, email })
    res.json({ success: true, data: {
      _id: (updated as any)._id?.toString() ?? req.user!.id,
      name: (updated as any).name,
      email: (updated as any).email,
      role: (updated as any).role ?? 'admin',
      avatar: (updated as any).avatar ?? null,
      bio: (updated as any).bio ?? null,
    }, message: 'Profile updated' })
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
