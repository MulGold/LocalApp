import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export interface TokenPayload {
  userId: string;
  email: string;
  role: 'customer' | 'admin' | 'staff' | string;
  exp: number; // millisecond timestamp (exactly 24 hours from creation)
}

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Native helper to load .env into process.env if needed without third-party dependencies
function loadEnvFile() {
  if (process.env.SESSION_SECRET) return;
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch {
    // Ignore error reading .env
  }
}

loadEnvFile();

/**
 * Returns SESSION_SECRET from process.env.SESSION_SECRET.
 * Strictly fails safely if SESSION_SECRET is missing or empty.
 * Never generates a runtime random secret and never uses a hardcoded fallback.
 */
export function getSessionSecret(): string {
  loadEnvFile();
  const secret = process.env.SESSION_SECRET;
  if (!secret || typeof secret !== 'string' || secret.trim().length === 0) {
    throw new Error('CRITICAL SECURITY ERROR: SESSION_SECRET is missing from process.env.');
  }
  return secret.trim();
}

/**
 * Generates an HMAC-SHA256 signed stateless session token.
 * Token format: base64url(payload) + "." + base64url(signature)
 */
export function createSessionToken(user: { id?: string; _id?: any; email: string; role?: string }): string {
  const secret = getSessionSecret();
  const userId = user.id || user._id?.toString() || '';
  const email = (user.email || '').trim().toLowerCase();
  const role = user.role || 'customer';
  const exp = Date.now() + SESSION_DURATION_MS;

  const payload: TokenPayload = {
    userId,
    email,
    role,
    exp
  };

  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr, 'utf8').toString('base64url');

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadB64);
  const signatureB64 = hmac.digest('base64url');

  return `${payloadB64}.${signatureB64}`;
}

/**
 * Verifies an HMAC-SHA256 session token.
 * Uses crypto.timingSafeEqual and enforces strict 24-hour expiration.
 * Returns verified TokenPayload or null on any failure.
 */
export function verifySessionToken(token: string): TokenPayload | null {
  try {
    if (!token || typeof token !== 'string') return null;

    const parts = token.trim().split('.');
    if (parts.length !== 2) return null;

    const [payloadB64, signatureB64] = parts;
    if (!payloadB64 || !signatureB64) return null;

    const secret = getSessionSecret();
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payloadB64);
    const expectedSignatureB64 = hmac.digest('base64url');

    const expectedBuffer = Buffer.from(expectedSignatureB64, 'utf8');
    const actualBuffer = Buffer.from(signatureB64, 'utf8');

    if (expectedBuffer.length !== actualBuffer.length) {
      return null;
    }

    if (!crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
      return null;
    }

    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const payload: TokenPayload = JSON.parse(payloadJson);

    if (!payload || !payload.email || !payload.exp || typeof payload.exp !== 'number') {
      return null;
    }

    // Strict 24-hour expiration check
    if (Date.now() >= payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Express middleware to authenticate requests via Bearer token.
 * Populates req.user exclusively from the verified token.
 * Rejects missing, malformed, invalid, or expired tokens with 401.
 * Never trusts x-user-email or x-user-role.
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || typeof authHeader !== 'string') {
    return res.status(401).json({ error: 'Access denied: Authentication token required.' });
  }

  const parts = authHeader.trim().split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return res.status(401).json({ error: 'Access denied: Malformed authorization header.' });
  }

  const token = parts[1];
  try {
    const verifiedUser = verifySessionToken(token);
    if (!verifiedUser) {
      return res.status(401).json({ error: 'Access denied: Invalid or expired session token.' });
    }

    req.user = verifiedUser;
    next();
  } catch (err: any) {
    console.error('Authentication error:', err.message);
    return res.status(500).json({ error: 'Server authentication configuration error.' });
  }
}

/**
 * Middleware requiring administrative or staff privileges from verified token.
 */
export function requireAdminOrStaff(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Access denied: Authentication required.' });
  }
  const role = req.user.role;
  if (role !== 'admin' && role !== 'staff') {
    return res.status(403).json({ error: 'Access denied: Administrative privileges required.' });
  }
  next();
}

/**
 * Middleware requiring strict administrator privileges from verified token.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Access denied: Authentication required.' });
  }
  const role = req.user.role;
  if (role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Administrator privileges required.' });
  }
  next();
}

