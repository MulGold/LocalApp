// Helper to get active user headers
export function getAuthHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  const token = localStorage.getItem('capstone_auth_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const userStr = localStorage.getItem('capstone_user') || localStorage.getItem('gips_user') || localStorage.getItem('currentUser') || localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      if (user?.role) headers['x-user-role'] = user.role;
      if (user?.email) headers['x-user-email'] = user.email;
    }
  } catch (e) {
    // Ignore JSON parse errors
  }

  return headers;
}

// In-memory cache strictly isolated per user session to prevent cross-account leaks
let ordersCache: any[] = [];
let cacheOwnerEmail: string | null = null;
let isCacheLoaded = false;

export function clearOrdersCache() {
  ordersCache = [];
  cacheOwnerEmail = null;
  isCacheLoaded = false;
}

// Centralized handler when server returns HTTP 401 Unauthorized
export function handleSessionExpired(): void {
  clearOrdersCache();
  localStorage.removeItem('capstone_auth_token');
  localStorage.removeItem('capstone_user');
  localStorage.removeItem('capstone_session_expiry');
  localStorage.removeItem('my_order_ids');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('auth:expired'));
  }
}

// 1. Fetch orders from MongoDB backend
export async function fetchOrders(filters?: { status?: string; email?: string; orderType?: string; search?: string; orderIds?: string[]; scope?: string }): Promise<any[]> {
  // Determine current active user email
  let currentEmail = '';
  try {
    const userStr = localStorage.getItem('capstone_user');
    if (userStr) {
      currentEmail = JSON.parse(userStr)?.email?.toLowerCase() || '';
    }
  } catch {
    // Ignore JSON error
  }

  // If user changed, purge stale cache immediately
  if (cacheOwnerEmail !== currentEmail) {
    clearOrdersCache();
    cacheOwnerEmail = currentEmail;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const params = new URLSearchParams();
    if (filters?.scope) params.append('scope', filters.scope);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.email) params.append('email', filters.email);
    if (filters?.orderType) params.append('orderType', filters.orderType);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.orderIds && filters.orderIds.length > 0) {
      params.append('orderIds', filters.orderIds.join(','));
    }

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/orders${queryString}`, {
      headers: getAuthHeaders(),
      signal: controller.signal
    });

    if (res.status === 401) {
      handleSessionExpired();
      throw new Error(`Failed to fetch orders (401)`);
    }

    if (!res.ok) {
      throw new Error(`Failed to fetch orders (${res.status})`);
    }

    const data = await res.json();
    const result = Array.isArray(data) ? data : [];

    // Cache results scoped to current authenticated user
    ordersCache = result;
    cacheOwnerEmail = currentEmail;
    isCacheLoaded = true;

    return result;
  } catch (error: any) {
    if (error?.message?.includes('401')) {
      // Do not treat user as authenticated or use cached orders on authentication failure
      return [];
    }
    console.warn('Backend orders fetch failed, using cached state:', error);
    if (cacheOwnerEmail !== currentEmail) {
      return [];
    }
    if (filters?.scope === 'manage') {
      const manageStatuses = ['Paid', 'Processing', 'Cooking', 'Ready for Pickup', 'Ready to Pickup'];
      let res = ordersCache.filter(o => manageStatuses.includes(o.status));
      if (filters?.status && filters.status !== 'All') {
        res = res.filter(o => o.status === filters.status);
      }
      return res;
    }
    if (filters?.scope === 'history') {
      let res = ordersCache.filter(o => o.status === 'Completed' || (o.status === 'Cancelled' && (o.cancelledBy === 'admin' || o.cancelledBy === 'staff')));
      if (filters?.status && filters.status !== 'All') {
        res = res.filter(o => o.status === filters.status);
      }
      return res;
    }
    if (filters?.status) {
      return ordersCache.filter(o => o.status === filters.status);
    }
    return ordersCache;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Helper to generate a collision-resistant temporary order ID using cryptographic randomness
function generateTemporaryOrderId(): string {
  let hexSuffix = '';
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const arr = new Uint8Array(4);
    window.crypto.getRandomValues(arr);
    hexSuffix = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
  } else {
    hexSuffix = Math.random().toString(16).substring(2, 10).padEnd(8, '0');
  }
  return `ORD-${Date.now()}-${hexSuffix}`;
}

// 2. Create order in MongoDB backend (with automatic stock & inventory deduction)
export async function createOrder(orderData: any): Promise<any> {
  const tempId = orderData.id || generateTemporaryOrderId();
  const optimisticOrder = {
    ...orderData,
    id: tempId,
    date: orderData.date || new Date().toISOString(),
    status: orderData.status || 'Pending',
    createdAt: new Date().toISOString()
  };

  // Optimistic update in cache
  ordersCache = [optimisticOrder, ...ordersCache.filter(o => o.id !== tempId)];

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(orderData)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      ordersCache = ordersCache.filter(o => o.id !== tempId);
      throw new Error(err.error || err.message || 'Failed to place order');
    }

    const savedOrder = await res.json();
    // Replace in cache
    ordersCache = ordersCache.map(o => o.id === tempId ? savedOrder : o);
    return savedOrder;
  } catch (error) {
    console.error('Error saving order to MongoDB:', error);
    ordersCache = ordersCache.filter(o => o.id !== tempId);
    throw error;
  }
}

// 3. Update order status in MongoDB backend
export async function modifyOrderStatus(orderId: string, status: string): Promise<any> {
  // Optimistic update
  ordersCache = ordersCache.map(o => o.id === orderId ? { ...o, status, paymentStatus: (status === 'Paid' || status === 'Completed') ? 'Paid' : o.paymentStatus } : o);

  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status })
    });

    if (res.status === 401) {
      handleSessionExpired();
      throw new Error('Unauthorized: Session expired (401)');
    }

    if (!res.ok) {
      throw new Error('Failed to update order status');
    }

    const updated = await res.json();
    ordersCache = ordersCache.map(o => o.id === orderId ? updated : o);
    return updated;
  } catch (error) {
    console.error('Error updating order status in MongoDB:', error);
    return ordersCache.find(o => o.id === orderId);
  }
}

// 4. Update order payment details in MongoDB backend
export async function modifyOrderPayment(orderId: string, paymentData: any): Promise<any> {
  // Optimistic update
  ordersCache = ordersCache.map(o => o.id === orderId ? { ...o, ...paymentData } : o);

  try {
    const res = await fetch(`/api/orders/${orderId}/payment`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(paymentData)
    });

    if (res.status === 401) {
      handleSessionExpired();
      throw new Error('Unauthorized: Session expired (401)');
    }

    if (!res.ok) {
      throw new Error('Failed to update order payment');
    }

    const updated = await res.json();
    ordersCache = ordersCache.map(o => o.id === orderId ? updated : o);
    return updated;
  } catch (error) {
    console.error('Error updating order payment in MongoDB:', error);
    return ordersCache.find(o => o.id === orderId);
  }
}

// 5. Delete order from MongoDB backend
export async function removeOrder(orderId: string): Promise<boolean> {
  ordersCache = ordersCache.filter(o => o.id !== orderId);

  try {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (res.status === 401) {
      handleSessionExpired();
      return false;
    }

    return res.ok;
  } catch (error) {
    console.error('Error deleting order from MongoDB:', error);
    return false;
  }
}

// 6. Fetch Sales Summary from MongoDB backend
export async function fetchSalesSummary(period: 'day' | 'week' | 'month' | 'year' | 'all' = 'all', date?: Date): Promise<any> {
  try {
    const params = new URLSearchParams();
    params.append('period', period);
    if (date) params.append('date', date.toISOString());

    const res = await fetch(`/api/orders/stats/summary?${params.toString()}`, {
      headers: getAuthHeaders()
    });

    if (res.status === 401) {
      handleSessionExpired();
      return null;
    }

    if (!res.ok) throw new Error('Failed to fetch sales summary');
    return await res.json();
  } catch (error) {
    console.error('Error fetching sales summary:', error);
    return null;
  }
}

// 7. Fetch Product Analysis from MongoDB backend
export async function fetchProductAnalysis(): Promise<any> {
  try {
    const res = await fetch('/api/orders/stats/product-analysis', {
      headers: getAuthHeaders()
    });

    if (res.status === 401) {
      handleSessionExpired();
      return null;
    }

    if (!res.ok) throw new Error('Failed to fetch product analysis');
    return await res.json();
  } catch (error) {
    console.error('Error fetching product analysis:', error);
    return null;
  }
}

// -------------------------------------------------------------
// Backwards Compatibility Helpers (for seamless async transition)
// -------------------------------------------------------------

export const getOrders = (): any[] => {
  if (!isCacheLoaded) {
    // Trigger background fetch if not yet loaded
    fetchOrders();
  }
  return ordersCache;
};

export const saveOrder = (orderData: any): any => {
  const tempId = orderData.id || generateTemporaryOrderId();
  const newOrder = {
    ...orderData,
    id: tempId,
    date: orderData.date || new Date().toISOString(),
    status: orderData.status || 'Pending'
  };

  createOrder(newOrder);
  return newOrder;
};

export const updateOrderStatus = (orderId: string, newStatus: string): any[] => {
  modifyOrderStatus(orderId, newStatus);
  return ordersCache.map(o => o.id === orderId ? { ...o, status: newStatus } : o);
};

export const updateOrderPayment = (orderId: string, paymentData: any): any[] => {
  modifyOrderPayment(orderId, paymentData);
  return ordersCache.map(o => o.id === orderId ? { ...o, ...paymentData } : o);
};

export const deleteOrder = (orderId: string): any[] => {
  removeOrder(orderId);
  return ordersCache.filter(o => o.id !== orderId);
};

// Initial background load
fetchOrders().catch(() => {});
