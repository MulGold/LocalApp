import mongoose from 'mongoose';
import { User, Category } from './models';

export const DEFAULT_CATEGORIES = [
  "Soups",
  "Sandwiches",
  "Value Meals",
  "Breakfast",
  "Vegetables",
  "Pork",
  "Chicken",
  "Seafood",
  "Appetizers",
  "Rice",
  "Salads",
  "Beverages"
];

let isConnected = false;
let connectionPromise: Promise<{ isConnected: boolean; error?: string }> | null = null;
let lastConnectionAttempt = 0;
let connectionFailed = false;
const RETRY_COOLDOWN_MS = 5000; // 5s cooldown after failed attempt (reduced from 15s for faster recovery)

// Sanitizes MongoDB connection URIs to handle common copy-paste typos
export function sanitizeMongoUri(rawUri?: string): string | null {
  if (!rawUri || typeof rawUri !== 'string') return null;
  let uri = rawUri.trim();

  // Fix common user copy-paste typos like: "mongodb+I srv://", "mongodb+lsrv://", "mongodb+ srv://", "mongodb+Isrv://"
  uri = uri.replace(/^mongodb\+([iIl1]|\s|_)*srv:\/\//i, 'mongodb+srv://');
  uri = uri.replace(/^mongodb:\/\/\s*/i, 'mongodb://');
  // Remove any internal spaces
  uri = uri.replace(/\s+/g, '');

  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    return null;
  }
  return uri;
}

// In-memory fallback if MONGODB_URI is not configured or temporarily unreachable
export const memoryStore = {
  users: [
    {
      id: 'admin-1',
      name: 'Store Admin',
      email: (process.env.ADMIN_EMAIL || 'admin@store.com').toLowerCase(),
      password: process.env.ADMIN_PASSWORD || 'Admin123',
      role: 'admin',
      status: 'Active',
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      failedLoginAttempts: 0,
      lockoutUntil: null as string | null,
      loginHistory: [
        {
          timestamp: new Date().toISOString(),
          ip: '127.0.0.1',
          userAgent: 'System Seed',
          action: 'Initial Account Setup'
        }
      ]
    }
  ],
  codes: new Map<string, { code: string; verified: boolean; expiresAt: number; createdAt: number }>(),
  products: [] as any[],
  categories: [...DEFAULT_CATEGORIES],
  inventory: [] as any[],
  inventoryLogs: [] as any[],
  orders: [] as any[]
};

// Monitor Mongoose connection events
mongoose.connection.on('connected', () => {
  isConnected = true;
  connectionFailed = false;
  console.log(`[MongoDB Atlas] Connected successfully to database: ${mongoose.connection.name || 'ecommerce_db'}`);
});

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  console.warn(`[MongoDB Atlas] Disconnected from database.`);
});

mongoose.connection.on('error', (err) => {
  isConnected = false;
  console.error(`[MongoDB Atlas Error]:`, err.message);
});

export async function connectMongoose(): Promise<{ isConnected: boolean; error?: string }> {
  // If already connected, return immediately
  if (mongoose.connection.readyState === 1) {
    isConnected = true;
    return { isConnected: true };
  }

  // If a connection attempt is already in flight, reuse it
  if (connectionPromise) {
    return connectionPromise;
  }

  // If Mongoose is already connecting (e.g. driver-level auto-reconnect), wait for completion
  if (mongoose.connection.readyState === 2) {
    return new Promise((resolve) => {
      const onConnected = () => {
        cleanup();
        isConnected = true;
        resolve({ isConnected: true });
      };
      const onError = (err: any) => {
        cleanup();
        resolve({ isConnected: false, error: err?.message || 'Connection failed' });
      };
      const timeout = setTimeout(() => {
        cleanup();
        resolve({ isConnected: mongoose.connection.readyState === 1 });
      }, 10000);
      const cleanup = () => {
        clearTimeout(timeout);
        mongoose.connection.removeListener('connected', onConnected);
        mongoose.connection.removeListener('error', onError);
      };
      mongoose.connection.once('connected', onConnected);
      mongoose.connection.once('error', onError);
    });
  }

  const sanitizedUri = sanitizeMongoUri(process.env.MONGODB_URI);

  if (!sanitizedUri) {
    return { isConnected: false, error: 'MONGODB_URI environment variable not provided or invalid format' };
  }

  // Prevent connection thrashing on repeated failures
  const now = Date.now();
  if (connectionFailed && now - lastConnectionAttempt < RETRY_COOLDOWN_MS) {
    return { isConnected: false, error: 'Connection in retry cooldown' };
  }

  lastConnectionAttempt = now;

  connectionPromise = (async () => {
    try {
      const dbName = sanitizedUri.split('/').pop()?.split('?')[0] || 'ecommerce_db';

      await mongoose.connect(sanitizedUri, {
        dbName: dbName.includes('?') ? 'ecommerce_db' : dbName,
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        minPoolSize: 1,
        family: 4, // IPv4 preference to avoid container IPv6 TLS handshake issues
        tls: sanitizedUri.includes('mongodb+srv://') || sanitizedUri.includes('ssl=true') || sanitizedUri.includes('tls=true'),
        tlsAllowInvalidCertificates: true
      });

      isConnected = true;
      connectionFailed = false;

      // Ensure default admin user exists in MongoDB Atlas via Mongoose
      const adminEmail = (process.env.ADMIN_EMAIL || 'admin@store.com').toLowerCase();
      const existingAdmin = await User.findOne({ email: adminEmail });
      if (!existingAdmin) {
        await User.create({
          id: 'admin-1',
          name: 'Store Admin',
          email: adminEmail,
          password: process.env.ADMIN_PASSWORD || 'Admin123',
          role: 'admin',
          createdAt: new Date(),
          lastLogin: new Date()
        });
        console.log(`[MongoDB Atlas] Default admin account seeded: ${adminEmail}`);
      }

      // Seed default categories if none exist
      const categoryCount = await Category.countDocuments();
      if (categoryCount === 0) {
        for (const catName of DEFAULT_CATEGORIES) {
          await Category.create({ name: catName }).catch(() => {});
        }
        console.log(`[MongoDB Atlas] Default categories seeded.`);
      }

      return { isConnected: true };
    } catch (error) {
      connectionFailed = true;
      isConnected = false;
      const errMsg = (error as Error).message?.split('\n')[0];
      console.warn(`[MongoDB Atlas] Connection notice (${errMsg}). In-memory fallback available.`);
      return { isConnected: false, error: errMsg };
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

// Utility to get current DB connection status instantly
export async function getDbStatus(): Promise<{ isConnected: boolean; dbName?: string }> {
  if (isConnected || (mongoose.connection.readyState as number) === 1) {
    return {
      isConnected: true,
      dbName: mongoose.connection.name || undefined
    };
  }
  
  // If not connected yet and not in cooldown, attempt background connect
  const result = await connectMongoose();
  return {
    isConnected: result.isConnected && (mongoose.connection.readyState as number) === 1,
    dbName: mongoose.connection.name || undefined
  };
}

export { mongoose };

