import { Router, Request, Response } from 'express';
import { Category, Product } from '../models';
import { getDbStatus, memoryStore, DEFAULT_CATEGORIES } from '../db';
import { authenticateToken, requireAdminOrStaff } from '../auth';

const router = Router();

// 1. GET /api/categories - List all categories
router.get('/', async (req: Request, res: Response) => {
  try {
    const { isConnected } = await getDbStatus();

    if (isConnected) {
      const categoryCount = await Category.countDocuments();
      if (categoryCount === 0) {
        for (const catName of DEFAULT_CATEGORIES) {
          await Category.create({ name: catName }).catch(() => {});
        }
      }

      const dbCategories = await Category.find().sort({ name: 1 }).lean();
      const categorySet = new Set<string>();
      dbCategories.forEach(c => {
        if (c.name && c.name.trim()) categorySet.add(c.name.trim());
      });

      // Also include any distinct categories from existing products (e.g. Uncategorized)
      const productCategories = await Product.distinct('category');
      productCategories.forEach(c => {
        if (c && typeof c === 'string' && c.trim()) categorySet.add(c.trim());
      });

      const categoriesList = Array.from(categorySet);
      return res.json(categoriesList);
    } else {
      if (!memoryStore.categories || memoryStore.categories.length === 0) {
        memoryStore.categories = [...DEFAULT_CATEGORIES];
      }
      const categorySet = new Set<string>(memoryStore.categories);
      (memoryStore.products || []).forEach(p => {
        if (p.category && p.category.trim()) categorySet.add(p.category.trim());
      });
      return res.json(Array.from(categorySet));
    }
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to retrieve categories' });
  }
});

// 2. POST /api/categories - Create new category (Admin/Staff only)
router.post('/', authenticateToken, requireAdminOrStaff, async (req: Request, res: Response) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    if (name.length > 50) {
      return res.status(400).json({ error: 'Category name cannot exceed 50 characters' });
    }

    const { isConnected } = await getDbStatus();

    if (isConnected) {
      const existing = await Category.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') } 
      });

      if (!existing) {
        await Category.create({ name });
      }
    } else {
      if (!memoryStore.categories) memoryStore.categories = [...DEFAULT_CATEGORIES];
      const exists = memoryStore.categories.some(
        c => c.toLowerCase() === name.toLowerCase()
      );
      if (!exists) {
        memoryStore.categories.push(name);
      }
    }

    return res.status(201).json({ success: true, name, message: 'Category added successfully' });
  } catch (error: any) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: error.message || 'Failed to create category' });
  }
});

// Helper function to remove a category
async function executeRemoveCategory(rawName: string, req: Request, res: Response) {
  try {
    const trimmedName = rawName.trim();
    if (!trimmedName) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const escapedName = trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const { isConnected } = await getDbStatus();

    if (isConnected) {
      // 1. Delete category record from Category collection
      await Category.deleteMany({
        name: { $regex: new RegExp(`^${escapedName}$`, 'i') }
      });

      // 2. Safely reassign menu items belonging to that category to 'Uncategorized' so they are NOT lost
      const affectedProducts = await Product.find({
        category: { $regex: new RegExp(`^${escapedName}$`, 'i') }
      });

      if (affectedProducts.length > 0) {
        await Product.updateMany(
          { category: { $regex: new RegExp(`^${escapedName}$`, 'i') } },
          { $set: { category: 'Uncategorized' } }
        );

        // Ensure 'Uncategorized' exists in Category collection
        const existingUncategorized = await Category.findOne({ name: 'Uncategorized' });
        if (!existingUncategorized) {
          await Category.create({ name: 'Uncategorized' }).catch(() => {});
        }
      }
    } else {
      // In-memory fallback
      if (memoryStore.categories) {
        memoryStore.categories = memoryStore.categories.filter(
          c => c.toLowerCase() !== trimmedName.toLowerCase()
        );
      }
      let reclassifiedCount = 0;
      (memoryStore.products || []).forEach(p => {
        if (p.category && p.category.toLowerCase() === trimmedName.toLowerCase()) {
          p.category = 'Uncategorized';
          reclassifiedCount++;
        }
      });
      if (reclassifiedCount > 0 && memoryStore.categories && !memoryStore.categories.includes('Uncategorized')) {
        memoryStore.categories.push('Uncategorized');
      }
    }

    return res.json({ 
      success: true, 
      name: trimmedName, 
      message: `Category "${trimmedName}" removed successfully. Associated items were safely reassigned to Uncategorized.` 
    });
  } catch (error: any) {
    console.error('Error removing category:', error);
    res.status(500).json({ error: error.message || 'Failed to remove category' });
  }
}

// 3. DELETE /api/categories/:name - Remove category by route parameter (Admin/Staff only)
router.delete('/:name', authenticateToken, requireAdminOrStaff, async (req: Request, res: Response) => {
  const paramName = Array.isArray(req.params.name) ? req.params.name[0] : (req.params.name || '');
  const rawName = decodeURIComponent(paramName);
  return executeRemoveCategory(rawName, req, res);
});

// 4. DELETE /api/categories - Remove category by query parameter (?name=...) or request body ({ name: "..." }) (Admin/Staff only)
router.delete('/', authenticateToken, requireAdminOrStaff, async (req: Request, res: Response) => {
  const rawName = (typeof req.query.name === 'string' ? req.query.name : '') || 
                  (typeof req.body?.name === 'string' ? req.body.name : '');
  return executeRemoveCategory(rawName, req, res);
});

export default router;
