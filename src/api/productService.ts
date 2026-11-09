import { getInventory, fetchInventory } from './inventoryService';

export const CATEGORIES = [
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

// Helper to safely parse JSON or non-JSON responses without exposing raw syntax errors
async function safeParseResponse(res: Response, defaultErrorMsg: string): Promise<any> {
  let data: any = null;
  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    try {
      const text = await res.text();
      if (text && (text.startsWith('{') || text.startsWith('['))) {
        data = JSON.parse(text);
      }
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const errorMsg = data?.error || data?.message || (res.status === 404 ? 'Requested item not found' : `${defaultErrorMsg} (Status ${res.status})`);
    throw new Error(errorMsg);
  }

  return data;
}

// Async API: Fetch dynamic categories from server
export const fetchCategories = async (): Promise<string[]> => {
  try {
    const res = await fetch('/api/categories', {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      return CATEGORIES;
    }
    const data = await safeParseResponse(res, 'Failed to fetch categories');
    return Array.isArray(data) && data.length > 0 ? data : CATEGORIES;
  } catch (err) {
    console.error('Error fetching categories:', err);
    return CATEGORIES;
  }
};

// Async API: Create new category (Admin/Staff)
export const createCategory = async (name: string): Promise<any> => {
  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (!cleanName) {
    throw new Error('Category name cannot be empty');
  }

  const res = await fetch('/api/categories', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ name: cleanName })
  });

  return await safeParseResponse(res, 'Failed to create category');
};

// Async API: Delete category (Admin/Staff)
export const deleteCategory = async (name: string): Promise<any> => {
  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (!cleanName) {
    throw new Error('Category name is required');
  }

  const res = await fetch(`/api/categories/${encodeURIComponent(cleanName)}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });

  return await safeParseResponse(res, 'Failed to delete category');
};

// Helper to calculate available whole menu servings from linked inventory and deduction quantities
export const calculateAvailableServings = (product: any, inventoryList: any[]): number => {
  if (!product || !Array.isArray(inventoryList) || inventoryList.length === 0) {
    const rawStock = Number(product?.stock ?? 0);
    return Math.max(0, Math.floor(isNaN(rawStock) ? 0 : rawStock));
  }

  const linkIds: string[] = Array.isArray(product.inventoryLinkIds) && product.inventoryLinkIds.length > 0
    ? product.inventoryLinkIds
    : (product.inventoryLinkId ? [product.inventoryLinkId] : []);

  if (linkIds.length === 0) {
    const rawStock = Number(product.stock ?? 0);
    return Math.max(0, Math.floor(isNaN(rawStock) ? 0 : rawStock));
  }

  const ingredients: any[] = Array.isArray(product.ingredients) ? product.ingredients : [];

  const capacities: number[] = linkIds.map((id: string) => {
    const invItem = inventoryList.find((i: any) => String(i.id) === String(id) || String(i._id) === String(id));
    if (!invItem) {
      return 0;
    }

    const rawQty = Number(invItem.quantity ?? 0);
    const validQty = (!isNaN(rawQty) && rawQty > 0) ? rawQty : 0;

    const matchedIng = ingredients.find((ing: any) => ing && String(ing.inventoryId) === String(id));
    const deductionQty = matchedIng ? Number(matchedIng.deductionQty) : undefined;

    if (deductionQty !== undefined && !isNaN(deductionQty) && deductionQty > 0) {
      const servings = Math.floor(validQty / deductionQty);
      return (!isFinite(servings) || isNaN(servings) || servings < 0) ? 0 : servings;
    }

    // Legacy fallback: 1-to-1 deduction (raw stock as whole servings)
    const legacyServings = Math.floor(validQty);
    return (!isFinite(legacyServings) || isNaN(legacyServings) || legacyServings < 0) ? 0 : legacyServings;
  });

  if (capacities.length === 0) {
    return 0;
  }

  const minCapacity = Math.min(...capacities);
  return (!isFinite(minCapacity) || isNaN(minCapacity) || minCapacity < 0) ? 0 : Math.floor(minCapacity);
};

// Helper to get authorization headers from current session
export const getAuthHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  const token = localStorage.getItem('capstone_auth_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const userStr = localStorage.getItem('capstone_user') || 
                    localStorage.getItem('gips_user') || 
                    localStorage.getItem('currentUser') || 
                    localStorage.getItem('user');
    if (userStr) {
      const parsed = JSON.parse(userStr);
      if (parsed.role) headers['x-user-role'] = parsed.role;
      if (parsed.email) headers['x-user-email'] = parsed.email;
    }
  } catch (err) {
    console.error('Error reading auth headers:', err);
  }
  return headers;
};

// In-memory runtime cache with 10-second TTL
let cachedProducts: any[] = [];
let isCacheLoaded = false;
let cacheTimestamp = 0;
const PRODUCT_CACHE_TTL_MS = 10000; // 10 seconds
let pendingProductsPromise: Promise<any[]> | null = null;

export const invalidateProductCache = () => {
  cacheTimestamp = 0;
};

// Async API: Fetch all products from MongoDB Atlas via REST API
export const fetchProducts = async (filters?: { category?: string; search?: string; availableOnly?: boolean; forceRefresh?: boolean }): Promise<any[]> => {
  const hasFilters = Boolean(
    (filters?.category && filters.category !== 'All') ||
    filters?.search ||
    filters?.availableOnly
  );
  const isForceRefresh = Boolean(filters?.forceRefresh);

  // Return cached products if within TTL and not forcing refresh or filtered
  if (!hasFilters && !isForceRefresh && isCacheLoaded && (Date.now() - cacheTimestamp < PRODUCT_CACHE_TTL_MS)) {
    return cachedProducts;
  }

  // If a request without filters is already in-flight, share the exact same promise
  if (!hasFilters && !isForceRefresh && pendingProductsPromise) {
    return pendingProductsPromise;
  }

  const promise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const params = new URLSearchParams();
      if (filters?.category && filters.category !== 'All') params.append('category', filters.category);
      if (filters?.search) params.append('search', filters.search);
      if (filters?.availableOnly) params.append('availableOnly', 'true');

      const url = `/api/products${params.toString() ? `?${params.toString()}` : ''}`;

      // Concurrently fetch products and ensure inventory is fully loaded from backend
      const [productsResult, inventoryResult] = await Promise.allSettled([
        fetch(url, { headers: getAuthHeaders(), signal: controller.signal }),
        fetchInventory({ forceRefresh: isForceRefresh })
      ]);

      if (productsResult.status !== 'fulfilled' || !productsResult.value.ok) {
        const errorData = productsResult.status === 'fulfilled'
          ? await productsResult.value.json().catch(() => ({}))
          : {};
        const status = productsResult.status === 'fulfilled' ? productsResult.value.status : 'Network Error';
        throw new Error(errorData.error || `Failed to fetch products: ${status}`);
      }

      const data = await productsResult.value.json();
      const rawProducts = Array.isArray(data) ? data : [];

      // Determine inventory data availability
      let inventoryList: any[] = [];
      let isInventoryReady = false;

      if (inventoryResult.status === 'fulfilled' && Array.isArray(inventoryResult.value)) {
        inventoryList = inventoryResult.value;
        isInventoryReady = true;
      } else {
        console.warn('Inventory fetch could not be fulfilled directly; checking inventory cache');
        const cached = getInventory();
        if (Array.isArray(cached) && cached.length > 0) {
          inventoryList = cached;
          isInventoryReady = true;
        }
      }

      // Merge inventory stock levels for linked items
      const mappedProducts = rawProducts.map((p: any) => {
        const linkIds: string[] = Array.isArray(p.inventoryLinkIds) && p.inventoryLinkIds.length > 0
          ? p.inventoryLinkIds
          : (p.inventoryLinkId ? [p.inventoryLinkId] : []);

        if (linkIds.length > 0) {
          if (isInventoryReady) {
            const availableStock = calculateAvailableServings(p, inventoryList);
            return { 
              ...p, 
              stock: availableStock, 
              inventoryLinkId: linkIds[0] || null, 
              inventoryLinkIds: linkIds 
            };
          } else {
            // If inventory API failed and no cache is available, do not silently wipe stock to 0.
            // Preserve existing product stock so items are not falsely displayed as Out of Stock.
            return {
              ...p,
              inventoryLinkId: linkIds[0] || null,
              inventoryLinkIds: linkIds
            };
          }
        }
        return p;
      });

      if (!hasFilters) {
        cachedProducts = mappedProducts;
        isCacheLoaded = true;
        cacheTimestamp = Date.now();
      }

      return mappedProducts;
    } catch (error) {
      console.error('Error in fetchProducts API:', error);
      // Return cached products if available
      return cachedProducts;
    } finally {
      clearTimeout(timeoutId);
      pendingProductsPromise = null;
    }
  })();

  if (!hasFilters && !isForceRefresh) {
    pendingProductsPromise = promise;
  }

  return promise;
};

// Async API: Get single product by ID
export const fetchProductById = async (id: number | string): Promise<any> => {
  try {
    const res = await fetch(`/api/products/${id}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch product ${id}`);
    }
    return await res.json();
  } catch (error) {
    console.error(`Error in fetchProductById(${id}):`, error);
    return cachedProducts.find(p => p.id === Number(id) || p.id === id);
  }
};

// Async API: Create new product in MongoDB Atlas
export const createProduct = async (newProduct: any): Promise<any> => {
  const linkIds: string[] = Array.isArray(newProduct.inventoryLinkIds)
    ? newProduct.inventoryLinkIds.filter(Boolean)
    : (newProduct.inventoryLinkId ? [newProduct.inventoryLinkId] : []);

  const payload = {
    ...newProduct,
    name: newProduct.name?.trim(),
    price: Number(newProduct.price),
    category: newProduct.category?.trim(),
    stock: Number(newProduct.stock || 0),
    image: newProduct.image || '',
    inventoryLinkId: linkIds[0] || null,
    inventoryLinkIds: linkIds,
    ingredients: Array.isArray(newProduct.ingredients) ? newProduct.ingredients : [],
    status: newProduct.status || 'Available',
    description: newProduct.description || ''
  };

  const res = await fetch('/api/products', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  });

  const data = await safeParseResponse(res, 'Failed to create product');

  const created = data.product || data;
  cachedProducts.push(created);
  cacheTimestamp = Date.now();
  isCacheLoaded = true;
  return created;
};

// Async API: Update existing product in MongoDB Atlas
export const editProduct = async (id: number | string, updatedData: any): Promise<any> => {
  let payload = { ...updatedData };
  if (updatedData.inventoryLinkIds !== undefined || updatedData.inventoryLinkId !== undefined) {
    const linkIds: string[] = Array.isArray(updatedData.inventoryLinkIds)
      ? updatedData.inventoryLinkIds.filter(Boolean)
      : (updatedData.inventoryLinkId ? [updatedData.inventoryLinkId] : []);
    payload.inventoryLinkIds = linkIds;
    payload.inventoryLinkId = linkIds[0] || null;
  }
  if (updatedData.ingredients !== undefined) {
    payload.ingredients = Array.isArray(updatedData.ingredients) ? updatedData.ingredients : [];
  }

  const cleanId = String(id).trim();
  const res = await fetch(`/api/products/${encodeURIComponent(cleanId)}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  });

  const data = await safeParseResponse(res, 'Failed to update product');

  const updated = data.product || data;
  cachedProducts = cachedProducts.map(p => (p.id === Number(id) || String(p.id) === cleanId || String(p._id) === cleanId ? updated : p));
  cacheTimestamp = Date.now();
  isCacheLoaded = true;
  return updated;
};

// Async API: Delete product in MongoDB Atlas
export const removeProduct = async (id: number | string): Promise<any> => {
  if (id === undefined || id === null || String(id).trim() === '') {
    throw new Error('Product ID is required for deletion');
  }

  const cleanId = String(id).trim();
  const res = await fetch(`/api/products/${encodeURIComponent(cleanId)}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });

  const data = await safeParseResponse(res, 'Failed to delete product');

  cachedProducts = cachedProducts.filter(p => p.id !== Number(cleanId) && String(p.id) !== cleanId && String(p._id) !== cleanId);
  cacheTimestamp = Date.now();
  return data;
};

// Synchronous Fallback & Cache Accessors for Existing Components
export const getProducts = () => {
  if (!isCacheLoaded) {
    // Trigger background async load
    fetchProducts().catch(console.error);
  }

  const inventory = getInventory();
  const hasInventory = Array.isArray(inventory) && inventory.length > 0;

  return cachedProducts.map((p: any) => {
    const linkIds: string[] = Array.isArray(p.inventoryLinkIds) && p.inventoryLinkIds.length > 0
      ? p.inventoryLinkIds
      : (p.inventoryLinkId ? [p.inventoryLinkId] : []);

    if (linkIds.length > 0) {
      if (hasInventory) {
        const availableStock = calculateAvailableServings(p, inventory);
        return { 
          ...p, 
          stock: availableStock, 
          inventoryLinkId: linkIds[0] || null, 
          inventoryLinkIds: linkIds 
        };
      }
      return {
        ...p,
        inventoryLinkId: linkIds[0] || null,
        inventoryLinkIds: linkIds
      };
    }
    return p;
  });
};

export const saveProducts = (products: any[]) => {
  cachedProducts = products;
};

export const addProduct = (newProduct: any) => {
  const productWithId = { ...newProduct, id: newProduct.id || Date.now() };
  createProduct(productWithId).catch(console.error);
  cachedProducts.push(productWithId);
  return productWithId;
};

export const updateProduct = (updatedProduct: any) => {
  editProduct(updatedProduct.id, updatedProduct).catch(console.error);
  cachedProducts = cachedProducts.map((p: any) => p.id === updatedProduct.id ? updatedProduct : p);
};

export const deleteProduct = (productId: number | string) => {
  removeProduct(productId).catch(console.error);
  cachedProducts = cachedProducts.filter((p: any) => p.id !== productId && p.id !== Number(productId));
};
