// Authorization headers helper from current user session
export const getAuthHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  const token = localStorage.getItem('capstone_auth_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const savedUser = localStorage.getItem('capstone_user');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      headers['x-user-role'] = parsed.role || 'customer';
      headers['x-user-email'] = parsed.email || '';
      headers['x-user-name'] = parsed.name || '';
    }
  } catch (err) {
    console.error('Error reading auth headers in inventoryService:', err);
  }
  return headers;
};

// In-memory runtime cache with 10-second TTL
let cachedInventory: any[] = [];
let isCacheLoaded = false;
let cacheTimestamp = 0;
const INVENTORY_CACHE_TTL_MS = 10000; // 10 seconds
let pendingInventoryPromise: Promise<any[]> | null = null;

export const invalidateInventoryCache = () => {
  cacheTimestamp = 0;
};

// 1. Fetch all inventory items from MongoDB Atlas via REST API
export const fetchInventory = async (filters?: { search?: string; lowStock?: boolean; forceRefresh?: boolean }): Promise<any[]> => {
  const hasFilters = Boolean(filters?.search || filters?.lowStock);
  const isForceRefresh = Boolean(filters?.forceRefresh);

  // Return cached inventory if within TTL and not forcing refresh or filtered
  if (!hasFilters && !isForceRefresh && isCacheLoaded && (Date.now() - cacheTimestamp < INVENTORY_CACHE_TTL_MS)) {
    return cachedInventory;
  }

  // If a request without filters is already in-flight, share the exact same promise
  if (!hasFilters && !isForceRefresh && pendingInventoryPromise) {
    return pendingInventoryPromise;
  }

  const promise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const params = new URLSearchParams();
      if (filters?.search) params.append('search', filters.search);
      if (filters?.lowStock) params.append('lowStock', 'true');

      const url = `/api/inventory${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, {
        headers: getAuthHeaders(),
        signal: controller.signal
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch inventory: ${res.status}`);
      }

      const data = await res.json();
      const items = Array.isArray(data) ? data : [];
      if (!hasFilters) {
        cachedInventory = items;
        isCacheLoaded = true;
        cacheTimestamp = Date.now();
      }
      return items;
    } catch (error) {
      console.error('Error in fetchInventory API:', error);
      if (isCacheLoaded && Array.isArray(cachedInventory) && cachedInventory.length > 0) {
        return cachedInventory;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      pendingInventoryPromise = null;
    }
  })();

  if (!hasFilters && !isForceRefresh) {
    pendingInventoryPromise = promise;
  }

  return promise;
};

// 2. Fetch reorder items (low stock)
export const fetchReorderList = async (): Promise<any[]> => {
  try {
    const res = await fetch('/api/inventory/reorder', {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      throw new Error('Failed to fetch reorder items');
    }
    return await res.json();
  } catch (error) {
    console.error('Error in fetchReorderList:', error);
    return cachedInventory.filter(i => i.quantity <= (i.lowStockThreshold || 10));
  }
};

// 3. Fetch inventory audit/history logs
export const fetchInventoryLogs = async (inventoryId?: string, limit = 100): Promise<any[]> => {
  try {
    const params = new URLSearchParams();
    if (inventoryId) params.append('inventoryId', inventoryId);
    if (limit) params.append('limit', String(limit));

    const res = await fetch(`/api/inventory/logs?${params.toString()}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      throw new Error('Failed to fetch inventory history logs');
    }
    return await res.json();
  } catch (error) {
    console.error('Error in fetchInventoryLogs:', error);
    return [];
  }
};

// 4. Fetch single inventory item by ID
export const fetchInventoryItem = async (id: string): Promise<any> => {
  try {
    const res = await fetch(`/api/inventory/${id}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch inventory item ${id}`);
    }
    return await res.json();
  } catch (error) {
    console.error(`Error in fetchInventoryItem(${id}):`, error);
    return cachedInventory.find(i => i.id === id);
  }
};

// 5. Create new inventory item in MongoDB Atlas
export const createInventoryItem = async (newItem: any): Promise<any> => {
  const payload = {
    id: newItem.id || undefined,
    name: newItem.name?.trim(),
    quantity: Number(newItem.quantity || 0),
    unit: newItem.unit?.trim() || 'pcs',
    stableQuantity: Number(newItem.stableQuantity || 0),
    lowStockThreshold: Number(newItem.lowStockThreshold || 10)
  };

  const res = await fetch('/api/inventory', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to add inventory item');
  }

  const created = data.item || data;
  cachedInventory.push(created);
  cacheTimestamp = Date.now();
  isCacheLoaded = true;
  return created;
};

// 6. Update inventory item in MongoDB Atlas
export const updateInventoryItem = async (id: string, updatedData: any): Promise<any> => {
  const res = await fetch(`/api/inventory/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(updatedData)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to update inventory item');
  }

  const updated = data.item || data;
  cachedInventory = cachedInventory.map(i => (i.id === id ? updated : i));
  cacheTimestamp = Date.now();
  isCacheLoaded = true;
  return updated;
};

// 7. Adjust stock (Stock-in, Stock-out, Manual adjustment, Order deduction)
export const adjustInventoryStock = async (
  id: string,
  options: {
    type: 'stock-in' | 'stock-out' | 'manual-adjustment' | 'order-deduction';
    amount?: number;
    newQuantity?: number;
    reason?: string;
    orderId?: string;
  }
): Promise<any> => {
  const res = await fetch(`/api/inventory/${id}/stock`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(options)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to adjust stock');
  }

  if (data.item) {
    cachedInventory = cachedInventory.map(i => (i.id === id ? data.item : i));
    cacheTimestamp = Date.now();
    isCacheLoaded = true;
  }
  return data;
};

// 8. Delete inventory item in MongoDB Atlas
export const deleteInventoryItem = async (id: string): Promise<any> => {
  const res = await fetch(`/api/inventory/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to delete inventory item');
  }

  cachedInventory = cachedInventory.filter(i => i.id !== id);
  cacheTimestamp = Date.now();
  return data;
};

// Backward-compatible synchronous accessors
export const getInventory = () => {
  if (!isCacheLoaded && !pendingInventoryPromise) {
    fetchInventory().catch(console.error);
  }
  return cachedInventory;
};

export const isInventoryLoaded = () => isCacheLoaded;

export const saveInventory = (items: any[]) => {
  cachedInventory = items;
};

export const deductInventory = (inventoryId: string, amount: number, orderId?: string) => {
  adjustInventoryStock(inventoryId, {
    type: 'order-deduction',
    amount,
    reason: `Deduction for order #${orderId || 'POS'}`
  }).catch(console.error);

  cachedInventory = cachedInventory.map((item: any) => {
    if (item.id === inventoryId) {
      return { ...item, quantity: Math.max(0, item.quantity - amount) };
    }
    return item;
  });
};

export interface InventoryTurnoverItem {
  id: string;
  name: string;
  unit: string;
  beginningStock: number;
  used: number;
  endingStock: number;
  averageInventory: number;
  turnover: number | null;
}

// Fetch calculated inventory turnover from backend for a specific period
export const fetchInventoryTurnover = async (startDate: string, endDate: string): Promise<InventoryTurnoverItem[]> => {
  const params = new URLSearchParams({ startDate, endDate });
  const res = await fetch(`/api/inventory/turnover?${params.toString()}`, {
    headers: getAuthHeaders()
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch inventory turnover: ${res.status}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
};
