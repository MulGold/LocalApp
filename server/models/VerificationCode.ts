import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IVerificationCode extends Document {
  email: string;
  code: string;
  verified: boolean;
  expiresAt: Date;
  createdAt: Date;
}

const VerificationCodeSchema: Schema<IVerificationCode> = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    code: { type: String, required: true, trim: true },
    verified: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true, index: { expires: '0s' } }, // MongoDB TTL auto-cleanup
    createdAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true
  }
);

export const VerificationCode: Model<IVerificationCode> = 
  mongoose.models.VerificationCode || mongoose.model<IVerificationCode>('VerificationCode', VerificationCodeSchema);
