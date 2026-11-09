import { Router, Request, Response } from 'express';
import { Product } from '../models/Product';
import { getDbStatus, memoryStore } from '../db';
import { authenticateToken, requireAdminOrStaff } from '../auth';

const router = Router();

// 1. GET /api/products - List products (Public)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, search, availableOnly } = req.query;
    const { isConnected } = await getDbStatus();

    let filter: any = {};

    if (category && category !== 'All') {
      filter.category = String(category);
    }

    if (search) {
      filter.name = { $regex: String(search), $options: 'i' };
    }

    // Only filter by 'Available' status if explicitly requested via availableOnly query parameter
    if (availableOnly === 'true') {
      filter.status = 'Available';
    }

    if (isConnected) {
      const products = await Product.find(filter).sort({ id: 1 }).lean();
      return res.json(products);
    } else {
      // In-memory fallback
      let products = [...memoryStore.products];
      if (filter.category) {
        products = products.filter(p => p.category === filter.category);
      }
      if (filter.status) {
        products = products.filter(p => p.status === filter.status);
      }
      if (search) {
        const s = String(search).toLowerCase();
        products = products.filter(p => p.name?.toLowerCase().includes(s));
      }
      return res.json(products);
    }
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to retrieve products from database' });
  }
});

// 2. GET /api/products/:id - Get single product
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const numericId = Number(rawId);
    const { isConnected } = await getDbStatus();

    let product: any = null;

    if (isConnected) {
      if (!isNaN(numericId)) {
        product = await Product.findOne({ id: numericId }).lean();
      }
      if (!product) {
        product = await Product.findById(rawId).lean().catch(() => null);
      }
    } else {
      product = memoryStore.products.find(p => p.id === numericId || p.id === rawId || p._id === rawId);
    }

    if (!product) {
      return res.status(404).json({ error: `Product with ID ${rawId} not found` });
    }

    return res.json(product);
  } catch (error) {
    console.error('Error fetching product by ID:', error);
    res.status(500).json({ error: 'Failed to retrieve product' });
  }
});

// 3. POST /api/products - Create product (Admin/Staff only)
router.post('/', authenticateToken, requireAdminOrStaff, async (req: Request, res: Response) => {
  try {
    const { name, price, category, stock, image, inventoryLinkId, inventoryLinkIds, ingredients, status, description } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    const parsedPrice = Number(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ error: 'Price must be a valid non-negative number' });
    }

    if (!category || typeof category !== 'string' || !category.trim()) {
      return res.status(400).json({ error: 'Product category is required' });
    }

    const parsedStock = stock !== undefined && stock !== null ? Number(stock) : 0;
    if (isNaN(parsedStock) || parsedStock < 0) {
      return res.status(400).json({ error: 'Stock cannot be negative' });
    }

    const validStatus = status === 'Not Available' || status === 'Unavailable' || status === 'Out of Stock' 
      ? status 
      : 'Available';

    const resolvedLinkIds: string[] = Array.isArray(inventoryLinkIds)
      ? inventoryLinkIds.map(String).filter(Boolean)
      : (inventoryLinkId ? [String(inventoryLinkId)] : []);

    const resolvedIngredients = Array.isArray(ingredients)
      ? ingredients
          .filter((item: any) => item && item.inventoryId && !isNaN(Number(item.deductionQty)) && Number(item.deductionQty) > 0)
          .map((item: any) => ({
            inventoryId: String(item.inventoryId),
            deductionQty: Number(item.deductionQty)
          }))
      : [];

    const newId = req.body.id ? Number(req.body.id) : Date.now();
    const productPayload = {
      id: newId,
      name: name.trim(),
      price: parsedPrice,
      category: category.trim(),
      stock: parsedStock,
      image: image || '',
      inventoryLinkId: resolvedLinkIds[0] || null,
      inventoryLinkIds: resolvedLinkIds,
      ingredients: resolvedIngredients,
      status: validStatus,
      description: description ? String(description).trim() : ''
    };

    const { isConnected } = await getDbStatus();

    if (isConnected) {
      // Upsert or create
      const created = await Product.create(productPayload);
      return res.status(201).json(created.toJSON ? created.toJSON() : created);
    } else {
      memoryStore.products.push(productPayload);
      return res.status(201).json(productPayload);
    }
  } catch (error: any) {
    console.error('Error creating product:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'A product with this ID already exists' });
    }
    res.status(500).json({ error: error.message || 'Failed to create product in database' });
  }
});

// 4. PUT /api/products/:id - Update product (Admin/Staff only)
router.put('/:id', authenticateToken, requireAdminOrStaff, async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const numericId = Number(rawId);
    const { name, price, category, stock, image, inventoryLinkId, inventoryLinkIds, ingredients, status, description } = req.body;

    const updates: any = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Product name cannot be empty' });
      }
      updates.name = name.trim();
    }

    if (price !== undefined) {
      const parsedPrice = Number(price);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ error: 'Price must be a valid non-negative number' });
      }
      updates.price = parsedPrice;
    }

    if (category !== undefined) {
      if (typeof category !== 'string' || !category.trim()) {
        return res.status(400).json({ error: 'Category cannot be empty' });
      }
      updates.category = category.trim();
    }

    if (stock !== undefined) {
      const parsedStock = Number(stock);
      if (isNaN(parsedStock) || parsedStock < 0) {
        return res.status(400).json({ error: 'Stock cannot be negative' });
      }
      updates.stock = parsedStock;
    }

    if (image !== undefined) updates.image = image;
    if (inventoryLinkIds !== undefined || inventoryLinkId !== undefined) {
      const resolvedLinkIds: string[] = Array.isArray(inventoryLinkIds)
        ? inventoryLinkIds.map(String).filter(Boolean)
        : (inventoryLinkId ? [String(inventoryLinkId)] : []);
      updates.inventoryLinkIds = resolvedLinkIds;
      updates.inventoryLinkId = resolvedLinkIds[0] || null;
    }
    if (ingredients !== undefined) {
      updates.ingredients = Array.isArray(ingredients)
        ? ingredients
            .filter((item: any) => item && item.inventoryId && !isNaN(Number(item.deductionQty)) && Number(item.deductionQty) > 0)
            .map((item: any) => ({
              inventoryId: String(item.inventoryId),
              deductionQty: Number(item.deductionQty)
            }))
        : [];
    }
    if (status !== undefined) updates.status = status;
    if (description !== undefined) updates.description = String(description);

    updates.updatedAt = new Date();

    const { isConnected } = await getDbStatus();

    if (isConnected) {
      let query: any = { id: numericId };
      if (isNaN(numericId)) {
        query = { _id: rawId };
      }

      const updated = await Product.findOneAndUpdate(query, { $set: updates }, { returnDocument: 'after', runValidators: true }).lean();
      if (!updated) {
        return res.status(404).json({ error: `Product with ID ${rawId} not found` });
      }
      return res.json(updated);
    } else {
      const idx = memoryStore.products.findIndex(p => p.id === numericId || p.id === rawId || p._id === rawId);
      if (idx === -1) {
        return res.status(404).json({ error: `Product with ID ${rawId} not found` });
      }
      memoryStore.products[idx] = { ...memoryStore.products[idx], ...updates };
      return res.json(memoryStore.products[idx]);
    }
  } catch (error: any) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: error.message || 'Failed to update product in database' });
  }
});

// Helper function to delete a product
async function executeDeleteProduct(rawId: string | number | undefined, req: Request, res: Response) {
  try {
    if (rawId === undefined || rawId === null || String(rawId).trim() === '') {
      return res.status(400).json({ error: 'Product ID is required for deletion' });
    }

    const cleanId = String(rawId).trim();
    const numericId = Number(cleanId);
    const { isConnected } = await getDbStatus();

    if (isConnected) {
      let query: any = { id: numericId };
      if (isNaN(numericId)) {
        query = { _id: cleanId };
      }

      const deleted = await Product.findOneAndDelete(query).lean();
      if (!deleted) {
        return res.status(404).json({ error: `Product with ID ${cleanId} not found` });
      }
      return res.json({ success: true, message: 'Product deleted successfully', id: cleanId });
    } else {
      const idx = memoryStore.products.findIndex(p => p.id === numericId || String(p.id) === cleanId || String(p._id) === cleanId);
      if (idx === -1) {
        return res.status(404).json({ error: `Product with ID ${cleanId} not found` });
      }
      memoryStore.products.splice(idx, 1);
      return res.json({ success: true, message: 'Product deleted successfully', id: cleanId });
    }
  } catch (error: any) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: error.message || 'Failed to delete product in database' });
  }
}

// 5. DELETE /api/products/:id - Delete product (Admin/Staff only)
router.delete('/:id', authenticateToken, requireAdminOrStaff, async (req: Request, res: Response) => {
  const paramId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  return executeDeleteProduct(paramId, req, res);
});

// 6. DELETE /api/products - Delete product via query (?id=...) or body ({ id: ... }) (Admin/Staff only)
router.delete('/', authenticateToken, requireAdminOrStaff, async (req: Request, res: Response) => {
  const rawId = req.query.id !== undefined ? req.query.id : req.body?.id;
  const singleId = Array.isArray(rawId) ? rawId[0] : rawId;
  return executeDeleteProduct(singleId as any, req, res);
});

export default router;
