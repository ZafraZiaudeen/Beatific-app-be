import { Schema, model, Document } from 'mongoose'

export interface IVerificationCode extends Document {
  email: string
  code: string
  type: 'registration' | 'forgot_password'
  verifyAttempts: number
  resendCount: number
  lastResendAt: Date
  expiresAt: Date
  isUsed: boolean
  pendingData?: {
    name: string
    password: string   
  }
  createdAt: Date
  updatedAt: Date
}

const verificationCodeSchema = new Schema<IVerificationCode>(
  {
    email:          { type: String, required: true, lowercase: true, trim: true },
    code:           { type: String, required: true },
    type:           { type: String, enum: ['registration', 'forgot_password'], required: true },
    verifyAttempts: { type: Number, default: 0 },
    resendCount:    { type: Number, default: 0 },
    lastResendAt:   { type: Date, default: Date.now },
    expiresAt:      { type: Date, required: true },
    isUsed:         { type: Boolean, default: false },
    pendingData:    {
      name:     { type: String },
      password: { type: String },
    },
  },
  { timestamps: true }
)

verificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 })
verificationCodeSchema.index({ email: 1, type: 1 })

export const VerificationCode = model<IVerificationCode>('VerificationCode', verificationCodeSchema)
