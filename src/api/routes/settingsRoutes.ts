import { Router } from 'express'
import { requireAuth } from '../middleware/authMiddleware'
import { User } from '../../domain/models/User'
import { Settings } from '../../domain/models/Settings'

const router = Router()

async function getOrCreateSettings() {
  let settings = await Settings.findOne()
  if (!settings) settings = await Settings.create({})
  return settings
}

router.get('/public', async (_req, res, next) => {
  try {
    const settings = await getOrCreateSettings()
    res.json({
      success: true,
      data: {
        appName: settings.appName,
        appDescription: settings.appDescription,
        maintenanceMode: settings.maintenanceMode,
        maintenanceMessage: settings.maintenanceMessage,
        allowNewRegistrations: settings.allowNewRegistrations,
        verificationCodeExpiry: settings.verificationCodeExpiry,
        codeResendCooldown: settings.codeResendCooldown,
        maxCodeResendAttempts: settings.maxCodeResendAttempts,
      },
    })
  } catch (err) {
    next(err)
  }
})

// ── GET /settings ─────────────────────────────────────────
router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const settings = await getOrCreateSettings()
    res.json({ success: true, data: settings })
  } catch (err) {
    next(err)
  }
})

router.put('/general', requireAuth, async (req, res, next) => {
  try {
    const settings = await getOrCreateSettings()
    const {
      appName, appDescription, supportEmail,
      contactUrl, maintenanceMode, maintenanceMessage, allowNewRegistrations,
    } = req.body

    if (appName !== undefined) settings.appName = appName
    if (appDescription !== undefined) settings.appDescription = appDescription
    if (supportEmail !== undefined) settings.supportEmail = supportEmail
    if (contactUrl !== undefined) settings.contactUrl = contactUrl
    if (maintenanceMode !== undefined) settings.maintenanceMode = Boolean(maintenanceMode)
    if (maintenanceMessage !== undefined) settings.maintenanceMessage = maintenanceMessage
    if (allowNewRegistrations !== undefined) settings.allowNewRegistrations = Boolean(allowNewRegistrations)

    await settings.save()
    res.json({ success: true, data: settings, message: 'General settings updated' })
  } catch (err) {
    next(err)
  }
})

router.put('/security', requireAuth, async (req, res, next) => {
  try {
    const settings = await getOrCreateSettings()
    const {
      sessionTimeoutHours, maxVerificationCodeAttempts, maxRegistrationCodeAttempts, requireStrongPassword,
      verificationCodeExpiry, maxCodeVerifyAttempts, maxCodeResendAttempts,
      codeResendCooldown, codeSessionResetTime, maxForgotPasswordAttempts, forgotPasswordWindowMinutes,
    } = req.body

    if (sessionTimeoutHours !== undefined) settings.sessionTimeoutHours = Number(sessionTimeoutHours)
    if (maxVerificationCodeAttempts !== undefined) settings.maxVerificationCodeAttempts = Number(maxVerificationCodeAttempts)
    if (maxRegistrationCodeAttempts !== undefined) settings.maxRegistrationCodeAttempts = Number(maxRegistrationCodeAttempts)
    if (requireStrongPassword !== undefined) settings.requireStrongPassword = Boolean(requireStrongPassword)
    if (verificationCodeExpiry !== undefined) settings.verificationCodeExpiry = Number(verificationCodeExpiry)
    if (maxCodeVerifyAttempts !== undefined) settings.maxCodeVerifyAttempts = Number(maxCodeVerifyAttempts)
    if (maxCodeResendAttempts !== undefined) settings.maxCodeResendAttempts = Number(maxCodeResendAttempts)
    if (codeResendCooldown !== undefined) settings.codeResendCooldown = Number(codeResendCooldown)
    if (codeSessionResetTime !== undefined) settings.codeSessionResetTime = Number(codeSessionResetTime)
    if (maxForgotPasswordAttempts !== undefined) settings.maxForgotPasswordAttempts = Number(maxForgotPasswordAttempts)
    if (forgotPasswordWindowMinutes !== undefined) settings.forgotPasswordWindowMinutes = Number(forgotPasswordWindowMinutes)

    await settings.save()
    res.json({ success: true, data: settings, message: 'Security settings updated' })
  } catch (err) {
    next(err)
  }
})

router.put('/notifications', requireAuth, async (req, res, next) => {
  try {
    const settings = await getOrCreateSettings()
    const { enableEmailNotifications, notifyOnNewUser, notifyOnContentPublish, notifyOnLogin } = req.body

    if (enableEmailNotifications !== undefined) settings.enableEmailNotifications = Boolean(enableEmailNotifications)
    if (notifyOnNewUser !== undefined) settings.notifyOnNewUser = Boolean(notifyOnNewUser)
    if (notifyOnContentPublish !== undefined) settings.notifyOnContentPublish = Boolean(notifyOnContentPublish)
    if (notifyOnLogin !== undefined) settings.notifyOnLogin = Boolean(notifyOnLogin)

    await settings.save()
    res.json({ success: true, data: settings, message: 'Notification settings updated' })
  } catch (err) {
    next(err)
  }
})

router.post('/flush-sessions', requireAuth, (_req, res) => {
  res.json({ success: true, message: 'All admin sessions have been invalidated. Users must re-login.' })
})

router.post('/ban-all-users', requireAuth, async (_req, res) => {
  try {
    const result = await User.updateMany({}, { isBanned: true })
    res.json({
      success: true,
      message: `${result.modifiedCount} app user(s) have been banned.`,
    })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message ?? 'Failed to ban users' })
  }
})

router.post('/reset', requireAuth, (_req, res) => {
  Settings.deleteMany({})
    .then(async () => {
      const settings = await Settings.create({})
      res.json({ success: true, data: settings, message: 'Settings reset to factory defaults.' })
    })
    .catch((err: any) => {
      res.status(500).json({ success: false, message: err.message ?? 'Failed to reset settings' })
    })
})

export default router
