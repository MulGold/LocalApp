import { Router, Request, Response } from 'express';
import { InventoryItem } from '../models/InventoryItem';
import { InventoryLog } from '../models/InventoryLog';
import { getDbStatus, memoryStore } from '../db';

import { authenticateToken, requireAdminOrStaff } from '../auth';

const router = Router();

// Helper to get performer identification from verified session token
function getPerformer(req: Request): string {
  if (req.user?.email) {
    return `${req.user.email} (${req.user.role || 'staff'})`;
  }
  return req.user?.role ? `User (${req.user.role})` : 'Staff / Admin';
}

// Helper to normalize decimal quantities to 6 decimal places to prevent IEEE 754 floating-point drift
function roundDecimal(val: number): number {
  return Number(val.toFixed(6));
}

// 1. GET /api/inventory/reorder - Get items that need reordering (quantity <= lowStockThreshold)
router.get('/reorder', authenticateToken, requireAdminOrStaff, async (req: Request, res: Response) => {
  try {
    const { isConnected } = await getDbStatus();

    if (isConnected) {
      // Find items where quantity is less than or equal to lowStockThreshold
      const items = await InventoryItem.find({
        $expr: { $lte: ['$quantity', '$lowStockThreshold'] }
      }).sort({ quantity: 1 }).lean();
      return res.json(items);
    } else {
      const items = memoryStore.inventory
        .filter(item => item.quantity <= (item.lowStockThreshold || 10))
        .sort((a, b) => a.quantity - b.quantity);
      return res.json(items);
    }
  } catch (error) {
    console.error('Error fetching reorder items:', error);
    res.status(500).json({ error: 'Failed to retrieve reorder list' });
  }
});

// 2. GET /api/inventory/logs - Get inventory audit/history logs
router.get('/logs', authenticateToken, requireAdminOrStaff, async (req: Request, res: Response) => {
  try {
    const { inventoryId, limit = '100' } = req.query;
    const maxLimit = Math.min(Number(limit) || 100, 500);
    const { isConnected } = await getDbStatus();

    if (isConnected) {
      const filter: any = {};
      if (inventoryId) {
        filter.inventoryId = String(inventoryId);
      }
      const logs = await InventoryLog.find(filter)
        .sort({ date: -1, createdAt: -1 })
        .limit(maxLimit)
        .lean();
      return res.json(logs);
    } else {
      let logs = [...memoryStore.inventoryLogs];
      if (inventoryId) {
        logs = logs.filter(l => l.inventoryId === String(inventoryId));
      }
      logs.sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());
      return res.json(logs.slice(0, maxLimit));
    }
  } catch (error) {
    console.error('Error fetching inventory logs:', error);
    res.status(500).json({ error: 'Failed to retrieve inventory history logs' });
  }
});

// 2.5. GET /api/inventory/turnover - Calculate inventory turnover for a specific period
router.get('/turnover', authenticateToken, requireAdminOrStaff, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate query parameters are required' });
    }

    const periodStart = new Date(String(startDate));
    let periodEnd = new Date(String(endDate));
    if (typeof endDate === 'string' && !endDate.includes('T') && !endDate.includes(':')) {
      periodEnd = new Date(`${endDate}T23:59:59.999Z`);
    }

    if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
      return res.status(400).json({ error: 'Invalid startDate or endDate format' });
    }

    const { isConnected } = await getDbStatus();

    if (isConnected) {
      const items = await InventoryItem.find().sort({ name: 1 }).lean();

      // 1. Single batch query for all logs during the period
      const allPeriodLogs = await InventoryLog.find({
        date: { $gte: periodStart, $lte: periodEnd }
      }).sort({ date: 1 }).lean();

      const periodLogsByItem = new Map<string, any[]>();
      for (const log of allPeriodLogs) {
        const invId = String(log.inventoryId);
        if (!periodLogsByItem.has(invId)) {
          periodLogsByItem.set(invId, []);
        }
        periodLogsByItem.get(invId)!.push(log);
      }

      // 2. Single batch aggregation to retrieve latest prior log before periodStart for each item
      const priorLogAgg = await InventoryLog.aggregate([
        { $match: { date: { $lt: periodStart } } },
        { $sort: { date: -1 } },
        {
          $group: {
            _id: '$inventoryId',
            remainingQuantity: { $first: '$remainingQuantity' }
          }
        }
      ]);
      const priorLogMap = new Map<string, number>();
      for (const p of priorLogAgg) {
        if (p._id != null) {
          priorLogMap.set(String(p._id), Number(p.remainingQuantity ?? 0));
        }
      }

      // 3. For any items without a prior log before periodStart, fetch earliest log ever in single batch
      const itemsWithoutPrior = items.filter(item => !priorLogMap.has(String(item.id || item._id)));
      const earliestLogMap = new Map<string, any>();
      if (itemsWithoutPrior.length > 0) {
        const itemIdsWithoutPrior = itemsWithoutPrior.map(i => String(i.id || i._id));
        const earliestLogAgg = await InventoryLog.aggregate([
          { $match: { inventoryId: { $in: itemIdsWithoutPrior } } },
          { $sort: { date: 1 } },
          {
            $group: {
              _id: '$inventoryId',
              date: { $first: '$date' },
              createdAt: { $first: '$createdAt' },
              remainingQuantity: { $first: '$remainingQuantity' },
              quantityChange: { $first: '$quantityChange' }
            }
          }
        ]);
        for (const e of earliestLogAgg) {
          if (e._id != null) {
            earliestLogMap.set(String(e._id), e);
          }
        }
      }

      const results = items.map((item: any) => {
        const itemId = String(item.id || item._id);

        // 1. Beginning Stock: Latest log before periodStart
        let beginningStock: number;
        if (priorLogMap.has(itemId)) {
          beginningStock = priorLogMap.get(itemId)!;
        } else if (earliestLogMap.has(itemId)) {
          const firstLogEver = earliestLogMap.get(itemId);
          const firstLogDate = new Date(firstLogEver.date || firstLogEver.createdAt);
          if (firstLogDate >= periodStart) {
            const preBalance = Number(firstLogEver.remainingQuantity ?? 0) - Number(firstLogEver.quantityChange ?? 0);
            beginningStock = Math.max(0, Number(preBalance.toFixed(4)));
          } else {
            beginningStock = Number(firstLogEver.remainingQuantity ?? 0);
          }
        } else {
          beginningStock = Number(item.quantity ?? 0);
        }

        // 2. Logs during the period
        const periodLogs = periodLogsByItem.get(itemId) || [];

        // 3. Used calculation: Cumulative inventory consumption during the selected period
        // Includes order-deduction and stock-out, offset by order-cancellation-restock
        let consumption = 0;
        let cancellationRestocks = 0;
        for (const log of periodLogs) {
          if (log.type === 'order-deduction' || log.type === 'stock-out') {
            consumption += Math.abs(Number(log.quantityChange ?? 0));
          } else if (log.type === 'order-cancellation-restock') {
            cancellationRestocks += Math.abs(Number(log.quantityChange ?? 0));
          }
        }
        const used = Math.max(0, Number((consumption - cancellationRestocks).toFixed(4)));

        // 4. Ending Stock calculation:
        // Latest log during the period, or beginningStock if no activity in period
        let endingStock: number;
        if (periodLogs.length > 0) {
          const latestPeriodLog = periodLogs[periodLogs.length - 1];
          endingStock = Number(latestPeriodLog.remainingQuantity ?? 0);
        } else {
          endingStock = beginningStock;
        }

        // 5. Average Inventory & Turnover Rate:
        // Turnover Rate = (Used Stock ÷ Average Inventory) × 100
        const averageInventory = Number(((beginningStock + endingStock) / 2).toFixed(4));
        let turnover: number | null = null;
        if (averageInventory > 0) {
          turnover = Number(((used / averageInventory) * 100).toFixed(4));
        } else {
          turnover = 0;
        }

        return {
          id: itemId,
          name: item.name || 'Unnamed Item',
          unit: item.unit || 'pcs',
          beginningStock,
          used,
          endingStock,
          averageInventory,
          turnover
        };
      });

      return res.json(results);
    } else {
      const items = [...memoryStore.inventory].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      const results = items.map((item: any) => {
        const itemId = String(item.id || item._id);

        const itemLogs = (memoryStore.inventoryLogs || [])
          .filter(l => String(l.inventoryId) === itemId)
          .sort((a, b) => new Date(a.date || a.createdAt).getTime() - new Date(b.date || b.createdAt).getTime());

        const priorLogs = itemLogs.filter(l => new Date(l.date || l.createdAt).getTime() < periodStart.getTime());
        const periodLogs = itemLogs.filter(l => {
          const t = new Date(l.date || l.createdAt).getTime();
          return t >= periodStart.getTime() && t <= periodEnd.getTime();
        });

        let beginningStock: number;
        if (priorLogs.length > 0) {
          const priorLog = priorLogs[priorLogs.length - 1];
          beginningStock = Number(priorLog.remainingQuantity ?? 0);
        } else if (itemLogs.length > 0) {
          const firstLog = itemLogs[0];
          const firstLogTime = new Date(firstLog.date || firstLog.createdAt).getTime();
          if (firstLogTime >= periodStart.getTime()) {
            const preBalance = Number(firstLog.remainingQuantity ?? 0) - Number(firstLog.quantityChange ?? 0);
            beginningStock = Math.max(0, Number(preBalance.toFixed(4)));
          } else {
            beginningStock = Number(firstLog.remainingQuantity ?? 0);
          }
        } else {
          beginningStock = Number(item.quantity ?? 0);
        }

        // Cumulative inventory consumption during the selected period
        // Includes order-deduction and stock-out, offset by order-cancellation-restock
        let consumption = 0;
        let cancellationRestocks = 0;
        for (const log of periodLogs) {
          if (log.type === 'order-deduction' || log.type === 'stock-out') {
            consumption += Math.abs(Number(log.quantityChange ?? 0));
          } else if (log.type === 'order-cancellation-restock') {
            cancellationRestocks += Math.abs(Number(log.quantityChange ?? 0));
          }
        }
        const used = Math.max(0, Number((consumption - cancellationRestocks).toFixed(4)));

        let endingStock: number;
        if (periodLogs.length > 0) {
          const latestPeriodLog = periodLogs[periodLogs.length - 1];
          endingStock = Number(latestPeriodLog.remainingQuantity ?? 0);
        } else {
          endingStock = beginningStock;
        }

        // Turnover Rate = (Used Stock ÷ Average Inventory) × 100
        const averageInventory = Number(((beginningStock + endingStock) / 2).toFixed(4));
        let turnover: number | null = null;
        if (averageInventory > 0) {
          turnover = Number(((used / averageInventory) * 100).toFixed(4));
        } else {
          turnover = 0;
        }

        return {
          id: itemId,
          name: item.name || 'Unnamed Item',
          unit: item.unit || 'pcs',
          beginningStock,
          used,
          endingStock,
          averageInventory,
          turnover
        };
      });

      return res.json(results);
    }
  } catch (error) {
    console.error('Error calculating inventory turnover:', error);
    res.status(500).json({ error: 'Failed to calculate inventory turnover' });
  }
});

// 3. GET /api/inventory - List all inventory items
router.get('/', async (req: Request, res: Response) => {
  try {
    const { search, lowStock } = req.query;
    const { isConnected } = await getDbStatus();

    if (isConnected) {
      const filter: any = {};
      if (search) {
        filter.name = { $regex: String(search), $options: 'i' };
      }
      if (lowStock === 'true') {
        filter.$expr = { $lte: ['$quantity', '$lowStockThreshold'] };
      }

      const items = await InventoryItem.find(filter).sort({ name: 1 }).lean();
      return res.json(items);
    } else {
      let items = [...memoryStore.inventory];
      if (search) {
        const s = String(search).toLowerCase();
        items = items.filter(i => i.name?.toLowerCase().includes(s));
      }
      if (lowStock === 'true') {
        items = items.filter(i => i.quantity <= (i.lowStockThreshold || 10));
      }
      items.sort((a, b) => a.name.localeCompare(b.name));
      return res.json(items);
    }
  } catch (error) {
    console.error('Error fetching inventory items:', error);
    res.status(500).json({ error: 'Failed to retrieve inventory items from database' });
  }
});

// 4. GET /api/inventory/:id - Get single inventory item
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const { isConnected } = await getDbStatus();

    let item: any = null;

    if (isConnected) {
      item = await InventoryItem.findOne({ id: rawId }).lean();
      if (!item) {
        item = await InventoryItem.findById(rawId).lean().catch(() => null);
      }
    } else {
      item = memoryStore.inventory.find(i => i.id === rawId || i._id === rawId);
    }

    if (!item) {
      return res.status(404).json({ error: `Inventory item with ID ${rawId} not found` });
    }

    return res.json(item);
  } catch (error) {
    console.error('Error fetching inventory item by ID:', error);
    res.status(500).json({ error: 'Failed to retrieve inventory item' });
  }
});

// 5. POST /api/inventory - Add new raw material/inventory item (Admin/Staff only)
router.post('/', authenticateToken, requireAdminOrStaff, async (req: Request, res: Response) => {
  try {

    const { name, quantity, unit, stableQuantity, lowStockThreshold, id } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Item name is required' });
    }

    const parsedQty = quantity !== undefined && quantity !== null ? roundDecimal(Number(quantity)) : 0;
    if (isNaN(parsedQty) || parsedQty < 0) {
      return res.status(400).json({ error: 'Quantity must be a non-negative number' });
    }

    const cleanUnit = (unit && typeof unit === 'string' && unit.trim()) ? unit.trim() : 'pcs';

    const parsedStable = stableQuantity !== undefined && stableQuantity !== null ? roundDecimal(Number(stableQuantity)) : 0;
    if (isNaN(parsedStable) || parsedStable < 0) {
      return res.status(400).json({ error: 'Stable quantity must be a non-negative number' });
    }

    const parsedThreshold = lowStockThreshold !== undefined && lowStockThreshold !== null ? roundDecimal(Number(lowStockThreshold)) : 10;
    if (isNaN(parsedThreshold) || parsedThreshold < 0) {
      return res.status(400).json({ error: 'Low stock threshold must be a non-negative number' });
    }

    const itemId = id ? String(id).trim() : `inv_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const performer = getPerformer(req);

    const itemPayload = {
      id: itemId,
      name: name.trim(),
      quantity: parsedQty,
      unit: cleanUnit,
      stableQuantity: parsedStable,
      lowStockThreshold: parsedThreshold
    };

    const { isConnected } = await getDbStatus();

    if (isConnected) {
      const created = await InventoryItem.create(itemPayload);

      // Create initial audit log
      await InventoryLog.create({
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        inventoryId: itemId,
        itemName: name.trim(),
        type: 'stock-in',
        quantityChange: parsedQty,
        remainingQuantity: parsedQty,
        reason: 'Initial inventory item created',
        performedBy: performer,
        date: new Date()
      });

      return res.status(201).json(created.toJSON ? created.toJSON() : created);
    } else {
      memoryStore.inventory.push(itemPayload);
      memoryStore.inventoryLogs.push({
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        inventoryId: itemId,
        itemName: name.trim(),
        type: 'stock-in',
        quantityChange: parsedQty,
        remainingQuantity: parsedQty,
        reason: 'Initial inventory item created',
        performedBy: performer,
        date: new Date()
      });
      return res.status(201).json(itemPayload);
    }
  } catch (error: any) {
    console.error('Error adding inventory item:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'An inventory item with this ID already exists' });
    }
    res.status(500).json({ error: error.message || 'Failed to add inventory item to database' });
  }
});

// 6. PUT /api/inventory/:id - Edit inventory item (Admin/Staff only)
router.put('/:id', authenticateToken, requireAdminOrStaff, async (req: Request, res: Response) => {
  try {

    const rawId = req.params.id;
    const { name, quantity, unit, stableQuantity, lowStockThreshold } = req.body;
    const performer = getPerformer(req);

    const updates: any = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Item name cannot be empty' });
      }
      updates.name = name.trim();
    }

    if (unit !== undefined) {
      if (typeof unit !== 'string' || !unit.trim()) {
        return res.status(400).json({ error: 'Unit cannot be empty' });
      }
      updates.unit = unit.trim();
    }

    if (stableQuantity !== undefined) {
      const parsedStable = Number(stableQuantity);
      if (isNaN(parsedStable) || parsedStable < 0) {
        return res.status(400).json({ error: 'Stable quantity must be a non-negative number' });
      }
      updates.stableQuantity = roundDecimal(parsedStable);
    }

    if (lowStockThreshold !== undefined) {
      const parsedThreshold = Number(lowStockThreshold);
      if (isNaN(parsedThreshold) || parsedThreshold < 0) {
        return res.status(400).json({ error: 'Low stock threshold must be a non-negative number' });
      }
      updates.lowStockThreshold = roundDecimal(parsedThreshold);
    }

    let qtyChanged = false;
    let oldQty = 0;
    let newQty = 0;

    if (quantity !== undefined) {
      const parsedQty = Number(quantity);
      if (isNaN(parsedQty) || parsedQty < 0) {
        return res.status(400).json({ error: 'Quantity must be a non-negative number' });
      }
      const roundedQty = roundDecimal(parsedQty);
      updates.quantity = roundedQty;
      newQty = roundedQty;
      qtyChanged = true;
    }

    updates.updatedAt = new Date();

    const { isConnected } = await getDbStatus();

    if (isConnected) {
      const currentItem = await InventoryItem.findOne({ id: rawId });
      if (!currentItem) {
        return res.status(404).json({ error: `Inventory item with ID ${rawId} not found` });
      }

      oldQty = currentItem.quantity;
      Object.assign(currentItem, updates);
      if (qtyChanged) {
        const threshold = currentItem.lowStockThreshold || 10;
        if (newQty > threshold || (newQty <= threshold && oldQty > threshold)) {
          currentItem.lowStockAcknowledged = false;
        }
      }
      const saved = await currentItem.save();

      // Log quantity change if any
      if (qtyChanged && oldQty !== newQty) {
        const diff = roundDecimal(newQty - oldQty);
        await InventoryLog.create({
          id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          inventoryId: currentItem.id,
          itemName: currentItem.name,
          type: 'manual-adjustment',
          quantityChange: diff,
          remainingQuantity: newQty,
          reason: `Manual inventory update (${oldQty} -> ${newQty} ${currentItem.unit})`,
          performedBy: performer,
          date: new Date()
        });
      }

      return res.json(saved.toJSON ? saved.toJSON() : saved);
    } else {
      const idx = memoryStore.inventory.findIndex(i => i.id === rawId || i._id === rawId);
      if (idx === -1) {
        return res.status(404).json({ error: `Inventory item with ID ${rawId} not found` });
      }

      oldQty = memoryStore.inventory[idx].quantity;
      memoryStore.inventory[idx] = { ...memoryStore.inventory[idx], ...updates };
      const currentItem = memoryStore.inventory[idx];
      if (qtyChanged) {
        const threshold = currentItem.lowStockThreshold || 10;
        if (newQty > threshold || (newQty <= threshold && oldQty > threshold)) {
          currentItem.lowStockAcknowledged = false;
        }
      }

      if (qtyChanged && oldQty !== newQty) {
        const diff = roundDecimal(newQty - oldQty);
        memoryStore.inventoryLogs.push({
          id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          inventoryId: currentItem.id,
          itemName: currentItem.name,
          type: 'manual-adjustment',
          quantityChange: diff,
          remainingQuantity: newQty,
          reason: `Manual inventory update (${oldQty} -> ${newQty} ${currentItem.unit})`,
          performedBy: performer,
          date: new Date()
        });
      }

      return res.json(currentItem);
    }
  } catch (error: any) {
    console.error('Error updating inventory item:', error);
    res.status(500).json({ error: error.message || 'Failed to update inventory item' });
  }
});

// 7. PATCH /api/inventory/:id/stock - Stock-in, Stock-out, or Manual Adjustment with Logging (Admin/Staff only)
router.patch('/:id/stock', authenticateToken, requireAdminOrStaff, async (req: Request, res: Response) => {
  try {

    const rawId = req.params.id;
    const { type, amount, newQuantity, reason, orderId } = req.body;
    const performer = getPerformer(req);

    if (!type || !['stock-in', 'stock-out', 'manual-adjustment', 'order-deduction'].includes(type)) {
      return res.status(400).json({ 
        error: 'Invalid action type. Must be "stock-in", "stock-out", "manual-adjustment", or "order-deduction"' 
      });
    }

    const { isConnected } = await getDbStatus();

    let item: any = null;

    if (isConnected) {
      item = await InventoryItem.findOne({ id: rawId });
      if (!item) {
        item = await InventoryItem.findById(rawId).catch(() => null);
      }
    } else {
      item = memoryStore.inventory.find(i => i.id === rawId || i._id === rawId);
    }

    if (!item) {
      return res.status(404).json({ error: `Inventory item with ID ${rawId} not found` });
    }

    const currentQty = roundDecimal(Number(item.quantity) || 0);
    let targetQty = currentQty;
    let qtyChange = 0;

    if (type === 'stock-in') {
      const parsedAmount = Number(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: 'Stock-in amount must be a positive number' });
      }
      const roundedAmount = roundDecimal(parsedAmount);
      targetQty = roundDecimal(currentQty + roundedAmount);
      qtyChange = roundedAmount;
    } else if (type === 'stock-out' || type === 'order-deduction') {
      const parsedAmount = Number(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: 'Stock-out amount must be a positive number' });
      }
      const roundedAmount = roundDecimal(parsedAmount);
      if (currentQty < roundedAmount) {
        return res.status(400).json({ 
          error: `Insufficient stock for ${item.name}. Current stock: ${currentQty} ${item.unit}, attempted deduction: ${roundedAmount} ${item.unit}. Quantity cannot become negative.` 
        });
      }
      targetQty = Math.max(0, roundDecimal(currentQty - roundedAmount));
      qtyChange = roundDecimal(-roundedAmount);
    } else if (type === 'manual-adjustment') {
      const parsedNewQty = newQuantity !== undefined ? Number(newQuantity) : Number(amount);
      if (isNaN(parsedNewQty) || parsedNewQty < 0) {
        return res.status(400).json({ error: 'Manual adjustment quantity must be a non-negative number' });
      }
      targetQty = roundDecimal(parsedNewQty);
      qtyChange = roundDecimal(targetQty - currentQty);
    }

    const logRecord = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      inventoryId: item.id,
      itemName: item.name,
      type: type as any,
      quantityChange: qtyChange,
      remainingQuantity: targetQty,
      reason: reason || (
        type === 'stock-in' ? `Stock-in (+${amount} ${item.unit})` :
        type === 'stock-out' ? `Stock-out (-${amount} ${item.unit})` :
        type === 'order-deduction' ? `Order deduction for #${orderId || 'POS'}` :
        `Manual count adjustment (${currentQty} -> ${targetQty} ${item.unit})`
      ),
      orderId: orderId || null,
      performedBy: performer,
      date: new Date()
    };

    const threshold = item.lowStockThreshold || 10;
    if (targetQty > threshold || (targetQty <= threshold && currentQty > threshold)) {
      item.lowStockAcknowledged = false;
    }

    if (isConnected) {
      item.quantity = targetQty;
      item.updatedAt = new Date();
      await item.save();

      const createdLog = await InventoryLog.create(logRecord);

      return res.json({
        success: true,
        item: item.toJSON ? item.toJSON() : item,
        log: createdLog.toJSON ? createdLog.toJSON() : createdLog
      });
    } else {
      item.quantity = targetQty;
      item.updatedAt = new Date();
      memoryStore.inventoryLogs.push(logRecord);

      return res.json({
        success: true,
        item,
        log: logRecord
      });
    }
  } catch (error: any) {
    console.error('Error in stock adjustment:', error);
    res.status(500).json({ error: error.message || 'Failed to adjust inventory stock' });
  }
});

// 8. DELETE /api/inventory/:id - Delete inventory item (Admin/Staff only)
router.delete('/:id', authenticateToken, requireAdminOrStaff, async (req: Request, res: Response) => {
  try {

    const rawId = req.params.id;
    const performer = getPerformer(req);
    const { isConnected } = await getDbStatus();

    if (isConnected) {
      const deleted = await InventoryItem.findOneAndDelete({ id: rawId });
      if (!deleted) {
        return res.status(404).json({ error: `Inventory item with ID ${rawId} not found` });
      }

      // Log deletion
      await InventoryLog.create({
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        inventoryId: deleted.id,
        itemName: deleted.name,
        type: 'stock-out',
        quantityChange: -deleted.quantity,
        remainingQuantity: 0,
        reason: `Item deleted from inventory (${deleted.name})`,
        performedBy: performer,
        date: new Date()
      });

      return res.json({ success: true, message: 'Inventory item deleted successfully', id: rawId });
    } else {
      const idx = memoryStore.inventory.findIndex(i => i.id === rawId || i._id === rawId);
      if (idx === -1) {
        return res.status(404).json({ error: `Inventory item with ID ${rawId} not found` });
      }

      const deleted = memoryStore.inventory.splice(idx, 1)[0];
      memoryStore.inventoryLogs.push({
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        inventoryId: deleted.id,
        itemName: deleted.name,
        type: 'stock-out',
        quantityChange: -deleted.quantity,
        remainingQuantity: 0,
        reason: `Item deleted from inventory (${deleted.name})`,
        performedBy: performer,
        date: new Date()
      });

      return res.json({ success: true, message: 'Inventory item deleted successfully', id: rawId });
    }
  } catch (error: any) {
    console.error('Error deleting inventory item:', error);
    res.status(500).json({ error: error.message || 'Failed to delete inventory item from database' });
  }
});

export default router;
