import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { connectMongoose, mongoose, sanitizeMongoUri } from './db';
import { User } from './models';

// Load environment variables from .env and .env.local if not already defined
function loadLocalEnv() {
  const envFiles = ['.env', '.env.local'];
  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
            if (process.env[key] === undefined) {
              process.env[key] = val;
            }
          }
        }
      } catch {
        // Silently skip unreadable files
      }
    }
  }
}

// Password validation reusing existing rules from server.ts
function validatePasswordPolicy(password: string): { isValid: boolean; error?: string } {
  if (typeof password !== 'string') {
    return { isValid: false, error: 'Password must be provided as text.' };
  }
  if (password.length < 8) {
    return { isValid: false, error: 'Password must be at least 8 characters in length.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { isValid: false, error: 'Password must contain at least 1 uppercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { isValid: false, error: 'Password must contain at least 1 number.' };
  }
  return { isValid: true };
}

// Password hashing reusing existing salted scrypt approach from server.ts
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

// Safely extracts the database name from MongoDB URI without revealing credentials
function extractDatabaseName(sanitizedUri: string): string | null {
  try {
    const pathPart = sanitizedUri.split('?')[0];
    const slashIdx = pathPart.lastIndexOf('/');
    if (slashIdx !== -1) {
      const dbName = pathPart.slice(slashIdx + 1).trim();
      return dbName.length > 0 ? dbName : null;
    }
  } catch {
    // Ignore parse error
  }
  return null;
}

export async function runBootstrap() {
  console.log('=== Gips Kitchen: Local Admin Bootstrap ===');

  // Step 1: Load local environment
  loadLocalEnv();

  // Step 2: Strict Environment & Safety Guard 1 - NODE_ENV
  if (process.env.NODE_ENV !== 'development') {
    console.error('[SAFETY ERROR] NODE_ENV must explicitly equal "development". Current value:', process.env.NODE_ENV || '(unset)');
    process.exit(1);
  }

  // Step 3: Strict Safety Guard 2 - BOOTSTRAP_LOCAL_ADMIN flag
  if (process.env.BOOTSTRAP_LOCAL_ADMIN !== 'true') {
    console.error('[SAFETY ERROR] BOOTSTRAP_LOCAL_ADMIN must equal "true". Execution aborted.');
    process.exit(1);
  }

  // Step 4: Strict Safety Guard 3 - LOCAL_ADMIN_PASSWORD validation
  const localPassword = process.env.LOCAL_ADMIN_PASSWORD;
  if (!localPassword) {
    console.error('[SAFETY ERROR] LOCAL_ADMIN_PASSWORD environment variable is missing.');
    process.exit(1);
  }

  const pwdCheck = validatePasswordPolicy(localPassword);
  if (!pwdCheck.isValid) {
    console.error(`[SAFETY ERROR] LOCAL_ADMIN_PASSWORD failed password policy: ${pwdCheck.error}`);
    process.exit(1);
  }

  // Step 5: Strict Safety Guard 4 - MONGODB_URI and Test Database Verification
  const rawMongoUri = process.env.MONGODB_URI;
  if (!rawMongoUri || typeof rawMongoUri !== 'string' || !rawMongoUri.trim()) {
    console.error('[SAFETY ERROR] MONGODB_URI is not configured.');
    process.exit(1);
  }

  const sanitizedUri = sanitizeMongoUri(rawMongoUri);
  if (!sanitizedUri) {
    console.error('[SAFETY ERROR] MONGODB_URI format is invalid.');
    process.exit(1);
  }

  const dbName = extractDatabaseName(sanitizedUri);
  if (!dbName) {
    console.error('[SAFETY ERROR] MONGODB_URI must explicitly specify a target database path.');
    process.exit(1);
  }

  // Database verification: must be confirmed via TEST_DB_NAME or contain test/local/jmeter/dev indicator
  const explicitTestDb = process.env.TEST_DB_NAME?.trim();
  const lowerDb = dbName.toLowerCase();
  const isRecognizedTestDb =
    (explicitTestDb && lowerDb === explicitTestDb.toLowerCase()) ||
    lowerDb.includes('test') ||
    lowerDb.includes('local') ||
    lowerDb.includes('jmeter') ||
    lowerDb.includes('dev');

  if (!isRecognizedTestDb) {
    console.error(
      `[DATABASE SAFETY ERROR] The configured database "${dbName}" is not verified as a separate test database.\n` +
      `To protect production data, database name must include "test", "local", "jmeter", "dev", or match TEST_DB_NAME.`
    );
    process.exit(1);
  }

  console.log(`[Safety Verified] Environment: development | Target Test Database: "${dbName}"`);

  // Step 6: Connect to MongoDB
  const connectionResult = await connectMongoose();
  if (!connectionResult.isConnected || mongoose.connection.readyState !== 1) {
    console.error('[DATABASE ERROR] Failed to establish direct connection to the test database:', connectionResult.error);
    process.exit(1);
  }

  // Step 7: Idempotent Account Check & Creation
  const targetEmail = 'localadmin@gipskitchen.test';
  const targetName = 'Local Test Admin';
  const targetRole = 'admin';
  const targetStatus = 'Active';

  try {
    const existingUser = await User.findOne({ email: targetEmail });

    if (existingUser) {
      console.log(`[Idempotent Check] Account "${targetEmail}" already exists.`);
      console.log(`[Preserved] Existing password and user data were preserved without modification.`);
      console.log(`[Account Status] Role: ${existingUser.role} | Status: ${existingUser.status}`);
      await mongoose.disconnect();
      console.log('[Complete] Bootstrap finished safely.');
      process.exit(0);
    }

    // Step 8: Create New Local Admin Account using salted scrypt hashing
    const hashedPassword = hashPassword(localPassword);
    const now = new Date();
    const newUserId = `local_admin_${Date.now()}`;

    await User.create({
      id: newUserId,
      name: targetName,
      email: targetEmail,
      password: hashedPassword,
      role: targetRole,
      status: targetStatus,
      createdAt: now,
      lastLogin: now,
      failedLoginAttempts: 0,
      lockoutUntil: null,
      loginHistory: [
        {
          timestamp: now,
          ip: '127.0.0.1',
          userAgent: 'Local Admin Bootstrap Script',
          action: 'Local Test Admin Provisioned'
        }
      ]
    });

    console.log(`[Success] Local Admin account created successfully!`);
    console.log(`  - Email:  ${targetEmail}`);
    console.log(`  - Name:   ${targetName}`);
    console.log(`  - Role:   ${targetRole}`);
    console.log(`  - Status: ${targetStatus}`);
    console.log(`  - Hashing: Salted scrypt (reusing server security algorithm)`);
    console.log(`[Ready] You can now authenticate via POST /api/auth/login using LOCAL_ADMIN_PASSWORD.`);
  } catch (error: any) {
    console.error('[ERROR] Failed to provision local admin account:', error?.message || error);
    process.exit(1);
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

// Run immediately when executed directly
runBootstrap().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
