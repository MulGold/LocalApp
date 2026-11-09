import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ILoginRecord {
  timestamp: Date;
  ip?: string;
  userAgent?: string;
  action?: string;
}

export interface IUser extends Document {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: 'customer' | 'admin' | 'staff';
  status: 'Active' | 'Suspended';
  createdAt: Date;
  lastLogin: Date;
  loginHistory?: ILoginRecord[];
  failedLoginAttempts?: number;
  lockoutUntil?: Date | null;
}

const UserSchema: Schema<IUser> = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password: { type: String, required: true },
    role: { 
      type: String, 
      enum: ['customer', 'admin', 'staff'], 
      default: 'customer',
      index: true
    },
    status: {
      type: String,
      enum: ['Active', 'Suspended'],
      default: 'Active',
      index: true
    },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date, default: Date.now },
    failedLoginAttempts: { type: Number, default: 0 },
    lockoutUntil: { type: Date, default: null },
    loginHistory: [
      {
        timestamp: { type: Date, default: Date.now },
        ip: { type: String },
        userAgent: { type: String },
        action: { type: String, default: 'Login' }
      }
    ]
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: any) => {
        delete ret.password;
        delete ret.__v;
        return ret;
      }
    }
  }
);

export const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
