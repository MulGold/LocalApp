import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { connectMongoose, getDbStatus, memoryStore, mongoose } from './server/db';
import { User, VerificationCode, Order } from './server/models';
import { sendVerificationEmail } from './server/email';
import { createSessionToken, authenticateToken, requireAdmin } from './server/auth';
import productRoutes from './server/routes/productRoutes';
import inventoryRoutes from './server/routes/inventoryRoutes';
import orderRoutes from './server/routes/orderRoutes';
import categoryRoutes from './server/routes/categoryRoutes';
import notificationRoutes from './server/routes/notificationRoutes';

// Security Helper: Safe string extractor and sanitizer
function sanitizeString(input: unknown, maxLength = 255): string {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLength);
}

// Email format validator: must be a valid email address (supports standard, educational, and corporate domains)
function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9]+([.-][a-zA-Z0-9]+)*\.[a-zA-Z]{2,}$/i;
  return emailRegex.test(email);
}

// Password rules: Minimum 8 characters, with at least 1 uppercase letter and 1 number
function validatePassword(password: string): { isValid: boolean; error?: string } {
  if (typeof password !== 'string') {
    return { isValid: false, error: 'Password must be provided as text.' };
  }
  if (password.length < 8) {
    return { isValid: false, error: 'Password must be at least 8 characters in length.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { isValid: false, error: 'Password must contain at least 1 capital/uppercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { isValid: false, error: 'Password must contain at least 1 number.' };
  }
  return { isValid: true };
}

// Full Name format validator: letters, spaces, hyphens, and apostrophes; no numbers; not entirely symbols
function validateFullName(name: unknown): { isValid: boolean; error?: string } {
  if (typeof name !== 'string') {
    return { isValid: false, error: 'Full Name is required.' };
  }
  const cleanName = name.trim();
  if (!cleanName) {
    return { isValid: false, error: 'Full Name is required.' };
  }
  if (cleanName.length > 50) {
    return { isValid: false, error: 'Full Name cannot exceed 50 characters.' };
  }
  if (/[0-9]/.test(cleanName)) {
    return { isValid: false, error: 'Full Name must not contain numbers.' };
  }
  if (!/[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/.test(cleanName)) {
    return { isValid: false, error: 'Full Name cannot be made entirely of symbols.' };
  }
  if (!/^[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF\s'-]+$/.test(cleanName)) {
    return { isValid: false, error: 'Full Name can only contain letters, spaces, hyphens, and apostrophes.' };
  }
  return { isValid: true };
}

// Password Hashing: Secure salted scrypt hash
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

// Password Verification: Supports newly hashed passwords, SHA-256, and legacy plain text
function verifyPassword(inputPassword: string, storedPassword?: string): boolean {
  if (!storedPassword) return false;
  // 1. Direct plaintext match (for legacy accounts or default seed like 'Admin123')
  if (storedPassword === inputPassword) return true;
  // 2. SHA-256 check
  try {
    const sha = crypto.createHash('sha256').update(inputPassword).digest('hex');
    if (storedPassword === sha) return true;
  } catch {}
  // 3. Salted scrypt match (salt:hash)
  if (storedPassword.includes(':')) {
    try {
      const [salt, key] = storedPassword.split(':');
      if (salt && key) {
        const computed = crypto.scryptSync(inputPassword, salt, 64).toString('hex');
        if (key.length === computed.length && crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(computed, 'hex'))) {
          return true;
        }
      }
    } catch {}
  }
  return false;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Attempt initial Mongoose connection to MongoDB Atlas in background
  connectMongoose().catch(err => {
    console.warn('[MongoDB Atlas Init]', err?.message || err);
  });

  // 1. Health check & DB status
  app.get('/api/health', async (req, res) => {
    const { isConnected, dbName } = await getDbStatus();
    res.json({
      status: 'ok',
      database: isConnected ? 'mongodb_atlas_connected' : 'in_memory_fallback',
      databaseName: dbName,
      timestamp: new Date().toISOString()
    });
  });

  // 2. Check if Account Exists (for Forgot Password verification)
  app.post('/api/auth/check-account', async (req, res) => {
    try {
      const email = sanitizeString(req.body.email).toLowerCase();

      if (!email) {
        return res.status(400).json({ error: 'Please enter your email address.' });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }

      const { isConnected } = await getDbStatus();
      let existingUser = null;

      if (isConnected) {
        existingUser = await User.findOne({ email });
      } else {
        existingUser = memoryStore.users.find(u => u.email === email);
      }

      if (!existingUser) {
        return res.status(404).json({ 
          exists: false,
          error: 'No account was found with this email address.' 
        });
      }

      return res.json({
        exists: true,
        email
      });
    } catch (error) {
      console.error('Error in check-account:', error);
      res.status(500).json({ error: 'Failed to verify account.' });
    }
  });

  // 3. Send 6-Digit Verification Code
  app.post('/api/auth/send-code', async (req, res) => {
    try {
      const email = sanitizeString(req.body.email).toLowerCase();
      const purpose = sanitizeString(req.body.purpose) || 'signup';

      if (!email) {
        return res.status(400).json({ error: 'Please enter an email address.' });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Requires a valid email address.' });
      }

      // If name is provided for signup, validate it before issuing verification code
      if (purpose === 'signup' && req.body.name !== undefined) {
        const nameCheck = validateFullName(req.body.name);
        if (!nameCheck.isValid) {
          return res.status(400).json({ error: nameCheck.error });
        }
      }

      const { isConnected } = await getDbStatus();

      // Check user existence based on purpose
      if (purpose === 'signup') {
        let existingUser = null;
        if (isConnected) {
          existingUser = await User.findOne({ email });
        } else {
          existingUser = memoryStore.users.find(u => u.email === email);
        }

        if (existingUser) {
          return res.status(400).json({ 
            error: 'An account with this email address already exists. Please Sign In instead.' 
          });
        }
      } else if (purpose === 'reset' || purpose === 'forgot-password') {
        let existingUser = null;
        if (isConnected) {
          existingUser = await User.findOne({ email });
        } else {
          existingUser = memoryStore.users.find(u => u.email === email);
        }

        if (!existingUser) {
          return res.status(404).json({ 
            error: 'No account was found with this email address.' 
          });
        }
      }

      // Generate secure 6-digit authentication code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      if (isConnected) {
        await VerificationCode.deleteMany({ email });
        await VerificationCode.create({
          email,
          code,
          verified: false,
          expiresAt
        });
      } else {
        memoryStore.codes.set(email, {
          code,
          verified: false,
          expiresAt: expiresAt.getTime(),
          createdAt: Date.now()
        });
      }

      // Dispatch verification code via Brevo HTTPS Transactional Email API
      const result = await sendVerificationEmail(email, code, purpose);

      if (!result.sent) {
        return res.status(500).json({
          error: result.error || 'Failed to send verification email. Please check your Brevo configuration or try again later.'
        });
      }

      return res.json({
        success: true,
        message: `A 6-digit verification code has been sent to ${email}. Please check your inbox.`,
        email
      });
    } catch (error) {
      console.error('Error in send-code:', error);
      res.status(500).json({ error: 'Failed to generate verification code.' });
    }
  });

  // 4. Verify the 6-Digit Code
  app.post('/api/auth/verify-code', async (req, res) => {
    try {
      const email = sanitizeString(req.body.email).toLowerCase();
      const code = sanitizeString(req.body.code);

      if (!email || !code) {
        return res.status(400).json({ error: 'Email and verification code are required.' });
      }

      const { isConnected } = await getDbStatus();
      let isValidCode = false;

      if (isConnected) {
        const record = await VerificationCode.findOne({
          email,
          code,
          expiresAt: { $gte: new Date() }
        });

        if (record) {
          isValidCode = true;
          record.verified = true;
          await record.save();
        }
      } else {
        const record = memoryStore.codes.get(email);
        if (record && record.code === code && record.expiresAt >= Date.now()) {
          isValidCode = true;
          record.verified = true;
        }
      }

      if (!isValidCode) {
        return res.status(400).json({ error: 'Invalid or expired verification code. Please check and try again.' });
      }

      return res.json({
        success: true,
        verified: true,
        email,
        message: 'Code verified successfully! You can now create your password.'
      });
    } catch (error) {
      console.error('Error in verify-code:', error);
      res.status(500).json({ error: 'Failed to verify authentication code.' });
    }
  });

  // 4. Complete Sign Up with Password Creation
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const email = sanitizeString(req.body.email).toLowerCase();
      const password = sanitizeString(req.body.password);
      const nameCheck = validateFullName(req.body.name);
      if (!nameCheck.isValid) {
        return res.status(400).json({ error: nameCheck.error });
      }

      const name = sanitizeString(typeof req.body.name === 'string' ? req.body.name.trim() : '', 50);

      if (!email || !isValidEmail(email)) {
        return res.status(400).json({ error: 'A valid email address is required.' });
      }

      // Strict Password Validation
      const pwdCheck = validatePassword(password);
      if (!pwdCheck.isValid) {
        return res.status(400).json({ error: pwdCheck.error });
      }

      const { isConnected } = await getDbStatus();

      // Check that code was verified
      let isVerified = false;
      if (isConnected) {
        const codeRecord = await VerificationCode.findOne({
          email,
          verified: true
        });
        if (codeRecord) {
          isVerified = true;
          await VerificationCode.deleteMany({ email });
        }
      } else {
        const record = memoryStore.codes.get(email);
        if (record && record.verified) {
          isVerified = true;
          memoryStore.codes.delete(email);
        }
      }

      if (!isVerified) {
        return res.status(400).json({ error: 'Verification code has not been verified. Please complete verification first.' });
      }

      const now = new Date();
      const newUserId = `usr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
      const userAgent = req.headers['user-agent'] || 'Web Browser';

      const initialActivity = {
        timestamp: now,
        ip: clientIp,
        userAgent,
        action: 'Account Registered'
      };

      if (isConnected) {
        const existing = await User.findOne({ email });
        if (existing) {
          return res.status(400).json({ error: 'An account with this email address already exists. Please Sign In.' });
        }

        await User.create({
          id: newUserId,
          email,
          name,
          password: hashPassword(password),
          role: 'customer',
          status: 'Active',
          createdAt: now,
          lastLogin: now,
          loginHistory: [initialActivity]
        });
      } else {
        const existing = memoryStore.users.find(u => u.email === email);
        if (existing) {
          return res.status(400).json({ error: 'An account with this email address already exists. Please Sign In.' });
        }

        memoryStore.users.push({
          id: newUserId,
          email,
          name,
          password: hashPassword(password),
          role: 'customer',
          status: 'Active',
          createdAt: now.toISOString(),
          lastLogin: now.toISOString(),
          failedLoginAttempts: 0,
          lockoutUntil: null as string | null,
          loginHistory: [{
            timestamp: now.toISOString(),
            ip: clientIp,
            userAgent,
            action: 'Account Registered'
          }]
        });
      }

      const token = createSessionToken({
        id: newUserId,
        email,
        role: 'customer'
      });

      return res.json({
        success: true,
        message: 'Account created successfully!',
        token,
        user: {
          id: newUserId,
          email,
          name,
          role: 'customer',
          status: 'Active',
          isFirstLogin: true
        }
      });
    } catch (error) {
      console.error('Error in signup:', error);
      res.status(500).json({ error: 'Failed to complete sign up.' });
    }
  });

  // 5. Unified Sign In for Customers and Admins
  app.post('/api/auth/login', async (req, res) => {
    try {
      const email = sanitizeString(req.body.email).toLowerCase();
      const password = sanitizeString(req.body.password, 64);

      if (!email || !password) {
        return res.status(400).json({ error: 'Please enter your email address and password.' });
      }

      const { isConnected } = await getDbStatus();
      let matchedUser: any = null;

      if (isConnected) {
        matchedUser = await User.findOne({ email });
      } else {
        matchedUser = memoryStore.users.find(u => u.email === email);
      }

      // If account does not exist, return generic error (do not reveal email existence)
      if (!matchedUser) {
        return res.status(401).json({ error: 'Invalid email address or password. Please try again.' });
      }

      const nowTime = Date.now();
      const lockoutUntilMs = matchedUser.lockoutUntil ? new Date(matchedUser.lockoutUntil).getTime() : 0;

      // 1. Check lockout BEFORE password verification
      if (lockoutUntilMs > nowTime) {
        const remainingSeconds = Math.max(1, Math.ceil((lockoutUntilMs - nowTime) / 1000));
        return res.status(429).json({
          error: 'Too many failed sign-in attempts. Your sign-in is temporarily locked for security.',
          isLocked: true,
          remainingSeconds,
          lockoutUntil: matchedUser.lockoutUntil
        });
      }

      // 2. When lockout expires, reset failedLoginAttempts to 0 and clear lockoutUntil
      if (lockoutUntilMs > 0 && lockoutUntilMs <= nowTime) {
        if (isConnected) {
          await User.updateOne(
            { email },
            { $set: { failedLoginAttempts: 0, lockoutUntil: null } }
          );
        } else {
          matchedUser.failedLoginAttempts = 0;
          matchedUser.lockoutUntil = null;
        }
        matchedUser.failedLoginAttempts = 0;
        matchedUser.lockoutUntil = null;
      }

      // 3. Verify password (supports hashed passwords as well as legacy plaintext)
      const isPasswordValid = verifyPassword(password, matchedUser.password);

      if (!isPasswordValid) {
        const lockoutDurationMs = 10 * 60 * 1000; // exactly 10 minutes
        const lockoutUntilTime = new Date(Date.now() + lockoutDurationMs);

        let currentAttempts = (matchedUser.failedLoginAttempts || 0) + 1;
        let activeLockout: Date | string | null = null;

        if (isConnected) {
          // Atomic MongoDB pipeline update: increments counter and triggers lockout on 10th attempt
          const updatedDoc: any = await User.findOneAndUpdate(
            { email },
            [
              {
                $set: {
                  failedLoginAttempts: { $add: [{ $ifNull: ['$failedLoginAttempts', 0] }, 1] }
                }
              },
              {
                $set: {
                  lockoutUntil: {
                    $cond: {
                      if: { $gte: ['$failedLoginAttempts', 10] },
                      then: { $ifNull: ['$lockoutUntil', lockoutUntilTime] },
                      else: null
                    }
                  }
                }
              }
            ],
            { updatePipeline: true, returnDocument: 'after' } as any
          );

          if (updatedDoc) {
            currentAttempts = updatedDoc.failedLoginAttempts || 0;
            activeLockout = updatedDoc.lockoutUntil || null;
          }
        } else {
          matchedUser.failedLoginAttempts = (matchedUser.failedLoginAttempts || 0) + 1;
          if (matchedUser.failedLoginAttempts >= 10) {
            if (!matchedUser.lockoutUntil) {
              matchedUser.lockoutUntil = lockoutUntilTime.toISOString();
            }
            activeLockout = matchedUser.lockoutUntil;
          }
          currentAttempts = matchedUser.failedLoginAttempts;
        }

        // 10th invalid attempt (or above): 429 lockout
        if (currentAttempts >= 10 && activeLockout) {
          const remainingSeconds = Math.max(1, Math.ceil((new Date(activeLockout).getTime() - Date.now()) / 1000));
          return res.status(429).json({
            error: 'Too many failed sign-in attempts. Your sign-in is temporarily locked for security.',
            isLocked: true,
            remainingSeconds,
            lockoutUntil: activeLockout
          });
        }

        // Attempts 1-9: generic 401 response without revealing remaining attempts
        return res.status(401).json({ error: 'Invalid email address or password. Please try again.' });
      }

      // Check Account Status (Active / Suspended)
      const userStatus = matchedUser.status || 'Active';
      if (String(userStatus).trim().toLowerCase() === 'suspended') {
        return res.status(403).json({ 
          error: 'Your account is currently suspended. Please contact store management.' 
        });
      }

      // Determine whether this is the first successful login BEFORE updating lastLogin and loginHistory
      let isFirstLogin = false;
      const historyList = Array.isArray(matchedUser.loginHistory) ? matchedUser.loginHistory : [];
      const hasPriorSignIn = historyList.some((h: any) => h.action === 'User Sign In');

      if (!hasPriorSignIn) {
        const createdMs = matchedUser.createdAt ? new Date(matchedUser.createdAt).getTime() : 0;
        const lastLoginMs = matchedUser.lastLogin ? new Date(matchedUser.lastLogin).getTime() : 0;

        // If lastLogin is equal to createdAt (within 1s margin of creation) and no prior User Sign In exists
        if (createdMs > 0 && lastLoginMs > 0 && Math.abs(lastLoginMs - createdMs) <= 1000) {
          isFirstLogin = true;
        }
      }

      // Record login history, update last login, and reset failedLoginAttempts
      const now = new Date();
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
      const userAgent = req.headers['user-agent'] || 'Web Browser';
      const newActivity = {
        timestamp: now,
        ip: clientIp,
        userAgent,
        action: 'User Sign In'
      };

      if (isConnected) {
        const hasArrayHistory = Array.isArray(matchedUser.loginHistory);
        const updateOp: any = {
          $set: {
            failedLoginAttempts: 0,
            lockoutUntil: null,
            lastLogin: now
          }
        };

        if (hasArrayHistory) {
          updateOp.$push = {
            loginHistory: {
              $each: [newActivity],
              $position: 0,
              $slice: 20
            }
          };
        } else {
          updateOp.$set.loginHistory = [newActivity];
        }

        await User.updateOne(
          { _id: matchedUser._id },
          updateOp
        );

        matchedUser.failedLoginAttempts = 0;
        matchedUser.lockoutUntil = null;
        matchedUser.lastLogin = now;
        if (!Array.isArray(matchedUser.loginHistory)) {
          matchedUser.loginHistory = [];
        }
        matchedUser.loginHistory.unshift(newActivity);
        if (matchedUser.loginHistory.length > 20) {
          matchedUser.loginHistory = matchedUser.loginHistory.slice(0, 20);
        }
      } else if (matchedUser) {
        matchedUser.failedLoginAttempts = 0;
        matchedUser.lockoutUntil = null;
        matchedUser.lastLogin = now.toISOString();
        if (!matchedUser.loginHistory) matchedUser.loginHistory = [];
        matchedUser.loginHistory.unshift({
          timestamp: now.toISOString(),
          ip: clientIp,
          userAgent,
          action: 'User Sign In'
        });
        if (matchedUser.loginHistory.length > 20) {
          matchedUser.loginHistory = matchedUser.loginHistory.slice(0, 20);
        }
      }

      const token = createSessionToken(matchedUser);

      return res.json({
        success: true,
        token,
        user: {
          id: matchedUser.id || matchedUser._id?.toString(),
          email: matchedUser.email,
          name: matchedUser.name,
          role: matchedUser.role || 'customer',
          status: matchedUser.status || 'Active',
          isFirstLogin
        }
      });
    } catch (error) {
      console.error('Error in login:', error);
      res.status(500).json({ error: 'Failed to sign in.' });
    }
  });

  // 6. Reset Password with Verified 6-Digit Code
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const email = sanitizeString(req.body.email).toLowerCase();
      const password = sanitizeString(req.body.password);

      if (!email || !isValidEmail(email)) {
        return res.status(400).json({ error: 'A valid email address is required.' });
      }

      // Strict Password Validation: Exact same rules as Sign-Up
      const pwdCheck = validatePassword(password);
      if (!pwdCheck.isValid) {
        return res.status(400).json({ error: pwdCheck.error });
      }

      const { isConnected } = await getDbStatus();

      // Verify that code was verified
      let isVerified = false;
      if (isConnected) {
        const codeRecord = await VerificationCode.findOne({
          email,
          verified: true
        });
        if (codeRecord) {
          isVerified = true;
          await VerificationCode.deleteMany({ email });
        }
      } else {
        const record = memoryStore.codes.get(email);
        if (record && record.verified) {
          isVerified = true;
          memoryStore.codes.delete(email);
        }
      }

      if (!isVerified) {
        return res.status(400).json({ 
          error: 'Verification code has not been verified. Please complete verification first.' 
        });
      }

      // Find the existing customer account
      let existingUser: any = null;
      if (isConnected) {
        existingUser = await User.findOne({ email });
      } else {
        existingUser = memoryStore.users.find(u => u.email === email);
      }

      if (!existingUser) {
        return res.status(404).json({ error: 'No account was found with this email address.' });
      }

      // Hash the new password
      const hashedPassword = hashPassword(password);
      const now = new Date();
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
      const userAgent = req.headers['user-agent'] || 'Web Browser';

      const resetActivity = {
        timestamp: now,
        ip: clientIp,
        userAgent,
        action: 'Password Reset via Verification Code'
      };

      if (isConnected && existingUser.save) {
        existingUser.password = hashedPassword;
        if (!existingUser.loginHistory) existingUser.loginHistory = [];
        existingUser.loginHistory.unshift(resetActivity);
        if (existingUser.loginHistory.length > 20) {
          existingUser.loginHistory = existingUser.loginHistory.slice(0, 20);
        }
        await existingUser.save();
      } else if (existingUser) {
        existingUser.password = hashedPassword;
        if (!existingUser.loginHistory) existingUser.loginHistory = [];
        existingUser.loginHistory.unshift({
          timestamp: now.toISOString(),
          ip: clientIp,
          userAgent,
          action: 'Password Reset via Verification Code'
        });
        if (existingUser.loginHistory.length > 20) {
          existingUser.loginHistory = existingUser.loginHistory.slice(0, 20);
        }
      }

      return res.json({
        success: true,
        message: 'Your password has been successfully changed.'
      });
    } catch (error) {
      console.error('Error in reset-password:', error);
      res.status(500).json({ error: 'Failed to reset password.' });
    }
  });

  // 6. User Management (Admin only) - Fetch all registered accounts with orders count & activity history
  app.get('/api/auth/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const { isConnected } = await getDbStatus();

      if (isConnected) {
        const users = await User.find({}, { password: 0 }).lean();
        
        // Count orders for each user
        const usersWithStats = await Promise.all(
          users.map(async (u: any) => {
            const orderCount = await Order.countDocuments({
              $or: [
                { 'customer.email': u.email },
                { 'customer.email': { $regex: new RegExp(`^${u.email}$`, 'i') } }
              ]
            }).catch(() => 0);

            return {
              id: u.id || u._id?.toString(),
              name: u.name,
              email: u.email,
              role: u.role || 'customer',
              status: u.status || 'Active',
              createdAt: u.createdAt || u._id?.getTimestamp?.() || new Date(),
              lastLogin: u.lastLogin || u.createdAt || new Date(),
              orderCount: orderCount || 0,
              loginHistory: u.loginHistory || []
            };
          })
        );

        return res.json(usersWithStats);
      }

      // Memory store fallback
      const safeUsers = memoryStore.users.map(({ password, ...u }) => {
        const orderCount = memoryStore.orders.filter(
          o => o.customer?.email && o.customer.email.toLowerCase() === u.email.toLowerCase()
        ).length;

        return {
          ...u,
          status: u.status || 'Active',
          orderCount,
          loginHistory: u.loginHistory || [
            {
              timestamp: u.lastLogin || u.createdAt,
              ip: '127.0.0.1',
              userAgent: 'System Session',
              action: 'Account Active'
            }
          ]
        };
      });

      return res.json(safeUsers);
    } catch (error) {
      console.error('Error in get-users:', error);
      res.status(500).json({ error: 'Failed to load user list.' });
    }
  });

  // Create Staff/Admin user account directly by Administrator
  app.post('/api/auth/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const name = sanitizeString(req.body.name, 100);
      const email = sanitizeString(req.body.email).toLowerCase();
      const password = sanitizeString(req.body.password);
      const role = ['admin', 'staff', 'customer'].includes(req.body.role) ? req.body.role : 'staff';
      const status = ['Active', 'Suspended'].includes(req.body.status) ? req.body.status : 'Active';

      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required.' });
      }

      // 1. Full Name: Reject numbers or names made entirely of symbols
      const nameCheck = validateFullName(name);
      if (!nameCheck.isValid) {
        return res.status(400).json({ error: nameCheck.error });
      }

      // 2. Email: Reject invalid email addresses such as "1@1"
      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }

      // 3. Password: Reject passwords that do not meet the minimum length requirement
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters in length.' });
      }

      const { isConnected } = await getDbStatus();
      const now = new Date();
      const newUserId = `usr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const newActivity = {
        timestamp: now,
        ip: req.ip || '127.0.0.1',
        userAgent: 'Created by Admin',
        action: 'Account Provisioned'
      };

      if (isConnected) {
        const existing = await User.findOne({ email });
        if (existing) {
          return res.status(400).json({ error: 'An account with this email already exists.' });
        }

        const created = await User.create({
          id: newUserId,
          name,
          email,
          password,
          role,
          status,
          createdAt: now,
          lastLogin: now,
          loginHistory: [newActivity]
        });

        return res.status(201).json({
          id: created.id,
          name: created.name,
          email: created.email,
          role: created.role,
          status: created.status,
          createdAt: created.createdAt,
          lastLogin: created.lastLogin,
          orderCount: 0,
          loginHistory: [newActivity]
        });
      } else {
        const existing = memoryStore.users.find(u => u.email === email);
        if (existing) {
          return res.status(400).json({ error: 'An account with this email already exists.' });
        }

        const newUser = {
          id: newUserId,
          name,
          email,
          password,
          role,
          status,
          createdAt: now.toISOString(),
          lastLogin: now.toISOString(),
          failedLoginAttempts: 0,
          lockoutUntil: null as string | null,
          loginHistory: [{
            timestamp: now.toISOString(),
            ip: '127.0.0.1',
            userAgent: 'Created by Admin',
            action: 'Account Provisioned'
          }]
        };

        memoryStore.users.push(newUser);

        const { password: _, ...safeUser } = newUser;
        return res.status(201).json({ ...safeUser, orderCount: 0 });
      }
    } catch (error) {
      console.error('Error creating user account:', error);
      res.status(500).json({ error: 'Failed to create user account.' });
    }
  });

  // Update User Status or Role (Preserve all historical records, no permanent delete)
  app.patch('/api/auth/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const id = typeof req.params.id === 'string' ? req.params.id : '';
      if (!id) {
        return res.status(400).json({ error: 'User ID is required.' });
      }
      const { status, role, name } = req.body;
      const { isConnected } = await getDbStatus();

      if (status && !['Active', 'Suspended'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status value.' });
      }

      if (role && !['customer', 'staff', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role value.' });
      }

      if (isConnected) {
        const query = mongoose.Types.ObjectId.isValid(id)
          ? { $or: [{ id }, { _id: id }] }
          : { id };

        const user = await User.findOne(query);
        if (!user) {
          return res.status(404).json({ error: 'User account not found.' });
        }

        if (status) user.status = status;
        if (role) user.role = role;
        if (name) user.name = sanitizeString(name, 100);

        if (!user.loginHistory) user.loginHistory = [];
        user.loginHistory.unshift({
          timestamp: new Date(),
          ip: req.ip || '127.0.0.1',
          userAgent: 'Admin Management',
          action: `Status updated to ${user.status}${role ? `, Role: ${role}` : ''}`
        });

        await user.save();

        return res.json({
          success: true,
          message: 'User account updated successfully.',
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
            lastLogin: user.lastLogin,
            createdAt: user.createdAt,
            loginHistory: user.loginHistory
          }
        });
      } else {
        const user = memoryStore.users.find(u => u.id === id);
        if (!user) {
          return res.status(404).json({ error: 'User account not found.' });
        }

        if (status) user.status = status;
        if (role) user.role = role;
        if (name) user.name = sanitizeString(name, 100);

        if (!user.loginHistory) user.loginHistory = [];
        user.loginHistory.unshift({
          timestamp: new Date().toISOString(),
          ip: '127.0.0.1',
          userAgent: 'Admin Management',
          action: `Status updated to ${user.status}${role ? `, Role: ${role}` : ''}`
        });

        const { password: _, ...safeUser } = user;
        return res.json({
          success: true,
          message: 'User account updated successfully.',
          user: safeUser
        });
      }
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ error: 'Failed to update user account.' });
    }
  });

  // 7. Products REST API (supports plural, singular, and menu aliases)
  app.use(['/api/products', '/api/product', '/api/menu', '/api/menu-items'], productRoutes);

  // 8. Categories REST API (supports plural and singular aliases)
  app.use(['/api/categories', '/api/category'], categoryRoutes);

  // 9. Inventory REST API
  app.use('/api/inventory', inventoryRoutes);

  // 10. Orders & Sales REST API
  app.use('/api/orders', orderRoutes);
  app.use('/api/sales', orderRoutes);

  // 11. Notifications REST API
  app.use('/api/notifications', notificationRoutes);

  // 12. Catch-all JSON 404 for any unhandled /api/* routes (strictly prevents falling through to Vite SPA index.html)
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
  });

  // 13. API error-handling middleware ensuring all API failures respond with JSON
  app.use('/api', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[API Error]', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    let distPath = path.join(process.cwd(), 'dist');
    if (!fs.existsSync(path.join(distPath, 'index.html')) && typeof __dirname !== 'undefined') {
      distPath = __dirname;
    }
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Graceful error logging to prevent crashes in production
  process.on('uncaughtException', (err) => {
    console.error('[Uncaught Exception]', err);
  });
  process.on('unhandledRejection', (reason) => {
    console.warn('[Unhandled Rejection]', reason);
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running at:`);
    console.log(`   - Local:   http://localhost:${PORT}`);
    console.log(`   - Network: http://127.0.0.1:${PORT}`);
  });
}

startServer();
