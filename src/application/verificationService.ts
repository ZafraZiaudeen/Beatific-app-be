import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { VerificationCode } from '../domain/models/VerificationCode'
import { User } from '../domain/models/User'
import { Settings } from '../domain/models/Settings'
import { emailService } from '../infrastructure/email/emailService'

const JWT_SECRET = process.env.JWT_SECRET ?? 'beatific-user-secret-change-in-production'

function generateCode(): string {
  return crypto.randomInt(100000, 999999).toString()
}

function throwErr(message: string, statusCode: number): never {
  const err: any = new Error(message)
  err.statusCode = statusCode
  throw err
}

async function getSettings() {
  let settings = await Settings.findOne()
  if (!settings) settings = await Settings.create({})
  return settings
}

export const verificationService = {

  async sendRegistrationCode(name: string, email: string, password: string) {
    const settings = await getSettings()

    if (!settings.allowNewRegistrations) {
      throwErr('New registrations are currently disabled by the administrator.', 403)
    }

    const existing = await User.findOne({ email })
    if (existing) {
      throwErr('An account with this email already exists.', 409)
    }

    const existingCode = await VerificationCode.findOne({
      email,
      type: 'registration',
      isUsed: false,
      expiresAt: { $gt: new Date() },
    })

    if (existingCode) {
      if (existingCode.resendCount >= settings.maxCodeResendAttempts) {
        const resetAt = new Date(existingCode.updatedAt.getTime() + settings.codeSessionResetTime * 60 * 1000)
        if (new Date() < resetAt) {
          const minutesLeft = Math.ceil((resetAt.getTime() - Date.now()) / 60000)
          throwErr(`Maximum resend attempts reached. Please try again in ${minutesLeft} minute(s).`, 429)
        }
        await VerificationCode.deleteOne({ _id: existingCode._id })
      } else {
        const cooldownExpiry = new Date(existingCode.lastResendAt.getTime() + settings.codeResendCooldown * 1000)
        if (new Date() < cooldownExpiry) {
          const secsLeft = Math.ceil((cooldownExpiry.getTime() - Date.now()) / 1000)
          throwErr(`Please wait ${secsLeft} seconds before requesting a new code.`, 429)
        }

        const newCode = generateCode()
        existingCode.code = newCode
        existingCode.resendCount += 1
        existingCode.lastResendAt = new Date()
        existingCode.verifyAttempts = 0
        existingCode.expiresAt = new Date(Date.now() + settings.verificationCodeExpiry * 60 * 1000)
        if (password !== '__RESEND__') {
          const hashed = await bcrypt.hash(password, 10)
          existingCode.pendingData = { name, password: hashed }
        }
        await existingCode.save()

        await emailService.sendVerificationCode(email, newCode, 'registration')
        return {
          message: 'A new verification code has been sent to your email.',
          expiresIn: settings.verificationCodeExpiry * 60,
          resendCooldown: settings.codeResendCooldown,
          resendsRemaining: settings.maxCodeResendAttempts - existingCode.resendCount,
        }
      }
    }

    const code = generateCode()
    const hashed = await bcrypt.hash(password, 10)

    await VerificationCode.deleteMany({ email, type: 'registration' })

    await VerificationCode.create({
      email,
      code,
      type: 'registration',
      expiresAt: new Date(Date.now() + settings.verificationCodeExpiry * 60 * 1000),
      pendingData: { name, password: hashed },
    })

    await emailService.sendVerificationCode(email, code, 'registration')

    return {
      message: 'A verification code has been sent to your email.',
      expiresIn: settings.verificationCodeExpiry * 60,
      resendCooldown: settings.codeResendCooldown,
      resendsRemaining: settings.maxCodeResendAttempts,
    }
  },

  async verifyRegistrationCode(email: string, code: string) {
    const settings = await getSettings()

    const record = await VerificationCode.findOne({
      email,
      type: 'registration',
      isUsed: false,
      expiresAt: { $gt: new Date() },
    })

    if (!record) {
      throwErr('Verification code has expired or was not found. Please request a new code.', 400)
    }

    if (record.verifyAttempts >= settings.maxCodeVerifyAttempts) {
      await VerificationCode.deleteOne({ _id: record._id })
      throwErr('Too many incorrect attempts. Please request a new code.', 429)
    }

    if (record.code !== code) {
      record.verifyAttempts += 1
      await record.save()
      const remaining = settings.maxCodeVerifyAttempts - record.verifyAttempts
      throwErr(`Invalid verification code. ${remaining} attempt(s) remaining.`, 400)
    }

    const user = await User.create({
      name: record.pendingData!.name,
      email,
      password: record.pendingData!.password,
    })

    record.isUsed = true
    await record.save()

    const expiresIn = `${settings.sessionTimeoutHours ?? 168}h`
    const token = jwt.sign(
      { id: user._id.toString(), email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn } as jwt.SignOptions
    )

    return {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      token,
    }
  },

  async sendForgotPasswordCode(email: string) {
    const settings = await getSettings()

    const user = await User.findOne({ email })
    if (!user) {
      return {
        message: 'If an account with that email exists, a verification code has been sent.',
        expiresIn: settings.verificationCodeExpiry * 60,
        resendCooldown: settings.codeResendCooldown,
        resendsRemaining: settings.maxCodeResendAttempts,
      }
    }

    const windowStart = new Date(Date.now() - settings.forgotPasswordWindowMinutes * 60 * 1000)
    const recentCount = await VerificationCode.countDocuments({
      email,
      type: 'forgot_password',
      createdAt: { $gte: windowStart },
    })

    if (recentCount >= settings.maxForgotPasswordAttempts) {
      throwErr(`Too many password reset requests. Please try again in ${settings.forgotPasswordWindowMinutes} minutes.`, 429)
    }

    const existingCode = await VerificationCode.findOne({
      email,
      type: 'forgot_password',
      isUsed: false,
      expiresAt: { $gt: new Date() },
    })

    if (existingCode) {
      if (existingCode.resendCount >= settings.maxCodeResendAttempts) {
        const resetAt = new Date(existingCode.updatedAt.getTime() + settings.codeSessionResetTime * 60 * 1000)
        if (new Date() < resetAt) {
          const minutesLeft = Math.ceil((resetAt.getTime() - Date.now()) / 60000)
          throwErr(`Maximum resend attempts reached. Please try again in ${minutesLeft} minute(s).`, 429)
        }
        await VerificationCode.deleteOne({ _id: existingCode._id })
      } else {
        const cooldownExpiry = new Date(existingCode.lastResendAt.getTime() + settings.codeResendCooldown * 1000)
        if (new Date() < cooldownExpiry) {
          const secsLeft = Math.ceil((cooldownExpiry.getTime() - Date.now()) / 1000)
          throwErr(`Please wait ${secsLeft} seconds before requesting a new code.`, 429)
        }

        const newCode = generateCode()
        existingCode.code = newCode
        existingCode.resendCount += 1
        existingCode.lastResendAt = new Date()
        existingCode.verifyAttempts = 0
        existingCode.expiresAt = new Date(Date.now() + settings.verificationCodeExpiry * 60 * 1000)
        await existingCode.save()

        await emailService.sendVerificationCode(email, newCode, 'forgot_password')
        return {
          message: 'A new verification code has been sent to your email.',
          expiresIn: settings.verificationCodeExpiry * 60,
          resendCooldown: settings.codeResendCooldown,
          resendsRemaining: settings.maxCodeResendAttempts - existingCode.resendCount,
        }
      }
    }

    const code = generateCode()
    await VerificationCode.deleteMany({ email, type: 'forgot_password', isUsed: false })

    await VerificationCode.create({
      email,
      code,
      type: 'forgot_password',
      expiresAt: new Date(Date.now() + settings.verificationCodeExpiry * 60 * 1000),
    })

    await emailService.sendVerificationCode(email, code, 'forgot_password')

    return {
      message: 'If an account with that email exists, a verification code has been sent.',
      expiresIn: settings.verificationCodeExpiry * 60,
      resendCooldown: settings.codeResendCooldown,
      resendsRemaining: settings.maxCodeResendAttempts,
    }
  },

  async verifyForgotPasswordCode(email: string, code: string) {
    const settings = await getSettings()

    const record = await VerificationCode.findOne({
      email,
      type: 'forgot_password',
      isUsed: false,
      expiresAt: { $gt: new Date() },
    })

    if (!record) {
      throwErr('Verification code has expired or was not found. Please request a new code.', 400)
    }

    if (record.verifyAttempts >= settings.maxCodeVerifyAttempts) {
      await VerificationCode.deleteOne({ _id: record._id })
      throwErr('Too many incorrect attempts. Please request a new code.', 429)
    }

    if (record.code !== code) {
      record.verifyAttempts += 1
      await record.save()
      const remaining = settings.maxCodeVerifyAttempts - record.verifyAttempts
      throwErr(`Invalid verification code. ${remaining} attempt(s) remaining.`, 400)
    }

    const resetToken = jwt.sign(
      { email, purpose: 'password_reset', codeId: record._id.toString() },
      JWT_SECRET,
      { expiresIn: '15m' } as jwt.SignOptions
    )

    return {
      message: 'Code verified successfully.',
      resetToken,
    }
  },

  async resetPassword(resetToken: string, newPassword: string) {
    let payload: any
    try {
      payload = jwt.verify(resetToken, JWT_SECRET)
    } catch {
      throwErr('Reset token is invalid or has expired. Please start over.', 400)
    }

    if (payload.purpose !== 'password_reset') {
      throwErr('Invalid reset token.', 400)
    }

    // Ensure the code hasn't been used
    const record = await VerificationCode.findById(payload.codeId)
    if (!record || record.isUsed) {
      throwErr('This reset link has already been used. Please request a new one.', 400)
    }

    const user = await User.findOne({ email: payload.email })
    if (!user) {
      throwErr('User not found.', 404)
    }

    if (newPassword.length < 6) {
      throwErr('Password must be at least 6 characters.', 400)
    }

    const hashed = await bcrypt.hash(newPassword, 10)
    await User.findByIdAndUpdate(user._id, { password: hashed })

    record.isUsed = true
    await record.save()

    return { message: 'Password has been reset successfully. You can now log in.' }
  },

  async resendCode(email: string, type: 'registration' | 'forgot_password') {
    if (type === 'registration') {
      const existing = await VerificationCode.findOne({
        email, type: 'registration', isUsed: false, expiresAt: { $gt: new Date() },
      })
      if (!existing || !existing.pendingData) {
        throwErr('No pending registration found. Please start over.', 400)
      }
      return this.sendRegistrationCode(existing.pendingData.name, email, '__RESEND__')
    } else {
      return this.sendForgotPasswordCode(email)
    }
  },
}
