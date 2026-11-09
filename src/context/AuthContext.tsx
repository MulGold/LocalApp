import { createContext, useState, useEffect, useMemo, useCallback } from 'react';
import { clearOrdersCache } from '../api/orderService';

export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

export const AuthContext = createContext<any>(null);

// Helper to get authorization headers with Bearer token for user management
const getAuthHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  const token = localStorage.getItem('capstone_auth_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('capstone_user');
    const savedExpiry = localStorage.getItem('capstone_session_expiry');
    const savedToken = localStorage.getItem('capstone_auth_token');

    // Only restore logged-in user when user, token, and unexpired session all exist
    if (savedUser && savedExpiry && savedToken && savedToken.trim().length > 0) {
      const expiryTime = Number(savedExpiry);
      if (!isNaN(expiryTime) && Date.now() < expiryTime) {
        try {
          return JSON.parse(savedUser);
        } catch {
          // JSON parse failed, clean up
        }
      }
    }

    // Clear stale or incomplete authentication storage if token is missing or session expired
    localStorage.removeItem('capstone_user');
    localStorage.removeItem('capstone_session_expiry');
    localStorage.removeItem('capstone_auth_token');
    localStorage.removeItem('my_order_ids');
    clearOrdersCache();
    return null;
  });

  const [accounts, setAccounts] = useState<any[]>(() => {
    const savedAccounts = localStorage.getItem('capstone_accounts');
    const defaults = [
      { 
        id: 'admin-1', 
        name: 'Store Admin', 
        role: 'admin', 
        status: 'Active',
        email: 'admin@store.com', 
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        orderCount: 0,
        loginHistory: [{ timestamp: new Date().toISOString(), ip: '127.0.0.1', userAgent: 'System Default', action: 'System Provisioned' }]
      },
    ];

    if (savedAccounts) {
      try {
        const parsed = JSON.parse(savedAccounts);
        const merged = [...parsed];
        defaults.forEach(def => {
          if (!merged.find(acc => acc.email?.toLowerCase() === def.email.toLowerCase() || acc.id === def.id)) {
            merged.push(def);
          }
        });
        return merged;
      } catch {
        return defaults;
      }
    }
    
    return defaults;
  });

  const [loadingUsers, setLoadingUsers] = useState(false);

  // Fetch users from server API with fallbacks (Strictly Admin only)
  const fetchUsers = useCallback(async () => {
    const token = localStorage.getItem('capstone_auth_token');
    if (!token) return accounts;

    setLoadingUsers(true);
    try {
      const res = await fetch('/api/auth/users', {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setAccounts(data);
          localStorage.setItem('capstone_accounts', JSON.stringify(data));
          setLoadingUsers(false);
          return data;
        }
      }
    } catch (err) {
      console.warn('Could not fetch users from server, using local store:', err);
    }
    setLoadingUsers(false);
    return accounts;
  }, [accounts]);

  // Initial fetch only after authentication is confirmed and user role is verified as 'admin'
  useEffect(() => {
    if (user && user.role === 'admin') {
      fetchUsers();
    }
  }, [user?.role, user?.id]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('capstone_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('capstone_user');
      localStorage.removeItem('capstone_session_expiry');
      localStorage.removeItem('capstone_auth_token');
      localStorage.removeItem('my_order_ids');
      clearOrdersCache();
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem('capstone_accounts', JSON.stringify(accounts));
  }, [accounts]);

  const logout = useCallback(() => {
    localStorage.removeItem('capstone_user');
    localStorage.removeItem('capstone_session_expiry');
    localStorage.removeItem('capstone_auth_token');
    localStorage.removeItem('my_order_ids');
    clearOrdersCache();
    setUser(null);
  }, []);

  // Periodic & event-based check for 24-hour session expiration and auth token validity
  useEffect(() => {
    if (!user) return;

    const checkExpiration = () => {
      const savedExpiry = localStorage.getItem('capstone_session_expiry');
      const savedToken = localStorage.getItem('capstone_auth_token');
      if (!savedExpiry || isNaN(Number(savedExpiry)) || Date.now() >= Number(savedExpiry) || !savedToken || !savedToken.trim()) {
        logout();
      }
    };

    checkExpiration();

    const interval = setInterval(checkExpiration, 60 * 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkExpiration();
      }
    };

    const handleAuthExpired = () => {
      logout();
    };

    window.addEventListener('focus', checkExpiration);
    window.addEventListener('auth:expired', handleAuthExpired);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkExpiration);
      window.removeEventListener('auth:expired', handleAuthExpired);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, logout]);

  // Request 6-digit verification code to Gmail
  const sendSignUpCode = useCallback(async (email: string, name?: string) => {
    const cleanEmail = email.trim().toLowerCase();

    // Client-side quick check against existing registered accounts
    const existingLocal = accounts.find(
      (a: any) => a.email && a.email.toLowerCase() === cleanEmail
    );
    if (existingLocal) {
      throw new Error('An account with this email address already exists. Please Sign In instead.');
    }

    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, name: name ? name.trim() : undefined, purpose: 'signup' }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send verification code');
      }
      return data;
    } catch (err: any) {
      throw new Error(err.message || 'Network error sending verification code');
    }
  }, [accounts]);

  // Check whether an account exists with the given email (for Forgot Password)
  const checkAccountExists = useCallback(async (email: string): Promise<{ exists: boolean; error?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    try {
      const res = await fetch('/api/auth/check-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail })
      });
      const data = await res.json();
      if (!res.ok) {
        const localFound = accounts.find(
          (a: any) => a.email && a.email.toLowerCase() === cleanEmail
        );
        if (localFound) {
          return { exists: true };
        }
        return { exists: false, error: data.error || 'No account was found with this email address.' };
      }
      return { exists: true };
    } catch {
      const localFound = accounts.find(
        (a: any) => a.email && a.email.toLowerCase() === cleanEmail
      );
      if (localFound) {
        return { exists: true };
      }
      return { exists: false, error: 'No account was found with this email address.' };
    }
  }, [accounts]);

  // Request 6-digit verification code for password reset
  const sendResetCode = useCallback(async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();

    // Verify account exists before requesting code
    const accountCheck = await checkAccountExists(cleanEmail);
    if (!accountCheck.exists) {
      throw new Error(accountCheck.error || 'No account was found with this email address.');
    }

    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, purpose: 'reset' }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send verification code');
      }
      return data;
    } catch (err: any) {
      throw new Error(err.message || 'Network error sending verification code');
    }
  }, [checkAccountExists]);

  // Verify 6-digit code for password reset
  const verifyResetCode = useCallback(async (email: string, code: string) => {
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: code.trim()
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid or expired verification code');
      }
      return data;
    } catch (err: any) {
      throw new Error(err.message || 'Verification error');
    }
  }, []);

  // Complete password reset
  const resetPassword = useCallback(async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password: password.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }

      // Update local accounts state
      setAccounts(prev => prev.map(acc => {
        if (acc.email && acc.email.toLowerCase() === cleanEmail) {
          return { ...acc, password: password.trim() };
        }
        return acc;
      }));

      return data;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to reset password');
    }
  }, []);

  // Verify 6-digit code for Gmail
  const verifySignUpCode = useCallback(async (email: string, code: string) => {
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: code.trim()
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid or expired verification code');
      }
      return data;
    } catch (err: any) {
      throw new Error(err.message || 'Verification error');
    }
  }, []);

  // Complete sign up by setting password (8 chars, 1 big letter, 1 number)
  const completeSignUp = useCallback(async (email: string, password: string, name?: string) => {
    const cleanEmail = email.trim().toLowerCase();

    // Check if account already exists locally
    const existingLocal = accounts.find(
      (a: any) => a.email && a.email.toLowerCase() === cleanEmail
    );
    if (existingLocal) {
      throw new Error('An account with this email address already exists. Please Sign In.');
    }

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password: password.trim(),
          name: name?.trim()
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Sign up failed');
      }

      if (data.success && data.user && data.token) {
        localStorage.setItem('capstone_auth_token', data.token);
        const expiry = Date.now() + SESSION_DURATION_MS;
        localStorage.setItem('capstone_session_expiry', expiry.toString());
        setUser(data.user);
        // Sync with local account state
        setAccounts(prev => {
          if (!prev.find(a => a.email.toLowerCase() === data.user.email.toLowerCase())) {
            return [...prev, { ...data.user, password }];
          }
          return prev;
        });
        return data.user;
      }
      throw new Error('Could not complete registration: No authorization token received');
    } catch (err: any) {
      throw new Error(err.message || 'Registration error');
    }
  }, [accounts]);

  // Unified Sign In (Customers & Admins) - strictly server-authenticated
  const login = useCallback(async (email: string, password: string) => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanPassword = password.trim();

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password: cleanPassword
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      let data: any = null;

      if (contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      }

      if (!res.ok) {
        if (res.status === 429 || data?.isLocked) {
          const lockErr: any = new Error(
            data?.error || 'Too many failed sign-in attempts. Your sign-in is temporarily locked for security.'
          );
          lockErr.isLocked = true;
          lockErr.remainingSeconds = typeof data?.remainingSeconds === 'number' ? data.remainingSeconds : 600;
          lockErr.lockoutUntil = data?.lockoutUntil || null;
          lockErr.status = 429;
          throw lockErr;
        }
        if (data && data.error) {
          throw new Error(data.error);
        }
        if (res.status === 403) {
          throw new Error('Your account is currently suspended. Please contact store management.');
        }
        throw new Error('Invalid email address or password');
      }

      if (!data) {
        throw new Error('Unable to connect to service. Please try again.');
      }

      if (data.success && data.user && data.token) {
        localStorage.setItem('capstone_auth_token', data.token);
        const expiry = Date.now() + SESSION_DURATION_MS;
        localStorage.setItem('capstone_session_expiry', expiry.toString());
        setUser(data.user);
        return data.user;
      }
      throw new Error('Sign in failed: No authorization token received from server');
    } catch (err: any) {
      if (err.isLocked || err.status === 429) {
        throw err;
      }
      throw new Error(err.message || 'Invalid email address or password');
    }
  }, []);

  const addAccount = useCallback(async (newAcc: any) => {
    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(newAcc)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create user account.');
      }
      const created = await res.json();
      setAccounts(prev => [created, ...prev.filter(a => a.email !== created.email && a.id !== created.id)]);
      return created;
    } catch (err: any) {
      if (err.message && !err.message.toLowerCase().includes('failed to fetch')) {
        throw err;
      }
      console.warn('API error creating account, saving locally:', err);
    }

    const accWithId = { 
      ...newAcc, 
      id: `usr_${Date.now()}`,
      email: newAcc.email.toLowerCase(),
      status: newAcc.status || 'Active',
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      orderCount: 0,
      loginHistory: [{ timestamp: new Date().toISOString(), ip: '127.0.0.1', userAgent: 'Admin Provisioned', action: 'Created' }]
    };
    setAccounts(prev => [accWithId, ...prev.filter(a => a.email !== accWithId.email)]);
    return accWithId;
  }, []);

  const updateAccount = useCallback(async (id: string, updatedData: any) => {
    try {
      const res = await fetch(`/api/auth/users/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(updatedData)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update user account.');
      }
      const data = await res.json();
      if (data.user) {
        setAccounts(prev => prev.map(acc => (acc.id === id || acc._id === id) ? { ...acc, ...data.user } : acc));
        return data.user;
      }
    } catch (err: any) {
      if (err.message && !err.message.toLowerCase().includes('failed to fetch')) {
        throw err;
      }
      console.warn('API error updating user, updating locally:', err);
    }
    setAccounts(prev => prev.map(acc => (acc.id === id || acc._id === id) ? { ...acc, ...updatedData } : acc));
  }, []);

  // Update Status: Active or Suspended (Preserves records & order history)
  const updateUserStatus = useCallback(async (id: string, status: 'Active' | 'Suspended') => {
    return updateAccount(id, { status });
  }, [updateAccount]);

  // Update Role: customer, staff, or admin
  const updateUserRole = useCallback(async (id: string, role: 'customer' | 'staff' | 'admin') => {
    return updateAccount(id, { role });
  }, [updateAccount]);

  const value = useMemo(() => ({
    user, 
    login,
    sendSignUpCode,
    verifySignUpCode,
    completeSignUp,
    checkAccountExists,
    sendResetCode,
    verifyResetCode,
    resetPassword,
    logout, 
    accounts,
    loadingUsers,
    fetchUsers,
    addAccount, 
    updateAccount, 
    updateUserStatus,
    updateUserRole
  }), [
    user, 
    login, 
    sendSignUpCode, 
    verifySignUpCode, 
    completeSignUp, 
    checkAccountExists,
    sendResetCode,
    verifyResetCode,
    resetPassword,
    logout, 
    accounts, 
    loadingUsers,
    fetchUsers,
    addAccount, 
    updateAccount, 
    updateUserStatus,
    updateUserRole
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
