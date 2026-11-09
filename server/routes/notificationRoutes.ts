import { Router, Request, Response } from 'express';
import { Order, InventoryItem } from '../models';
import { getDbStatus, memoryStore } from '../db';
import { authenticateToken, requireAdminOrStaff } from '../auth';

const router = Router();

// 1. GET /api/notifications/counts - Get active unread counts for customer and admin (authenticated)
router.get('/counts', authenticateToken, async (req: Request, res: Response) => {
  try {
    const currentUser = req.user!;
    const role = currentUser.role;
    const email = (currentUser.email || '').toLowerCase();

    const { isConnected } = await getDbStatus();

    let customerOrderUpdates = 0;
    let adminNewOrders = 0;
    let adminLowStock = 0;
    let lowStockItems: any[] = [];

    if (isConnected) {
      // Customer Notifications: Find orders belonging exclusively to this authenticated customer
      if (email) {
        const customerOrders = await Order.find({
          $or: [{ userEmail: email }, { 'customer.email': email }],
          status: { $ne: 'Pending' }
        }).select('id status customerViewedStatus updatedAt');

        for (const order of customerOrders) {
          // If customerViewedStatus does not match current order status, it is unread!
          if (!order.customerViewedStatus || order.customerViewedStatus !== order.status) {
            customerOrderUpdates++;
          }
        }
      }

      // Admin Notifications: Only computed if verified role is admin or staff
      if (role === 'admin' || role === 'staff') {
        adminNewOrders = await Order.countDocuments({
          orderType: 'Online',
          status: 'Paid',
          adminViewed: { $ne: true }
        });

        const allInventory = await InventoryItem.find({}).select('id name quantity unit lowStockThreshold lowStockAcknowledged');
        for (const item of allInventory) {
          const threshold = item.lowStockThreshold !== undefined ? item.lowStockThreshold : 10;
          if (item.quantity <= threshold) {
            lowStockItems.push({
              id: item.id,
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              lowStockThreshold: threshold,
              acknowledged: item.lowStockAcknowledged === true
            });
            if (item.lowStockAcknowledged !== true) {
              adminLowStock++;
            }
          }
        }
      }
    } else {
      // Memory Store fallback
      if (email) {
        const customerOrders = memoryStore.orders.filter(order => {
          const matchesEmail = (order.userEmail || '').toLowerCase() === email || (order.customer?.email || '').toLowerCase() === email;
          return matchesEmail && order.status !== 'Pending';
        });

        for (const order of customerOrders) {
          if (!order.customerViewedStatus || order.customerViewedStatus !== order.status) {
            customerOrderUpdates++;
          }
        }
      }

      if (role === 'admin' || role === 'staff') {
        adminNewOrders = memoryStore.orders.filter(order => 
          order.orderType === 'Online' && 
          order.status === 'Paid' && 
          order.adminViewed !== true
        ).length;

        for (const item of memoryStore.inventory) {
          const threshold = item.lowStockThreshold !== undefined ? item.lowStockThreshold : 10;
          if (item.quantity <= threshold) {
            lowStockItems.push({
              id: item.id,
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              lowStockThreshold: threshold,
              acknowledged: item.lowStockAcknowledged === true
            });
            if (item.lowStockAcknowledged !== true) {
              adminLowStock++;
            }
          }
        }
      }
    }

    return res.json({
      customerOrderUpdates,
      adminNewOrders,
      adminLowStock,
      lowStockItems
    });
  } catch (error: any) {
    console.error('Error fetching notification counts:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// 2. POST /api/notifications/customer/mark-read - Mark customer order updates as viewed (strictly own orders)
router.post('/customer/mark-read', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userEmail = (req.user!.email || '').toLowerCase();
    const { orderIds } = req.body;
    const ids: string[] = Array.isArray(orderIds) ? orderIds : [];

    if (ids.length === 0) {
      return res.json({ success: true, message: 'No orders specified' });
    }

    const { isConnected } = await getDbStatus();

    if (isConnected) {
      // Security: Only mark read orders that belong to the authenticated customer
      const orders = await Order.find({
        id: { $in: ids },
        $or: [{ userEmail }, { 'customer.email': userEmail }]
      });
      const now = new Date();
      for (const order of orders) {
        order.customerViewedStatus = order.status;
        order.customerLastViewedAt = now;
        await order.save();
      }
    } else {
      const now = new Date();
      for (const order of memoryStore.orders) {
        const matchesEmail = (order.userEmail || '').toLowerCase() === userEmail || (order.customer?.email || '').toLowerCase() === userEmail;
        const matchesId = ids.includes(order.id);
        if (matchesEmail && matchesId) {
          order.customerViewedStatus = order.status;
          order.customerLastViewedAt = now;
        }
      }
    }

    return res.json({ success: true, message: 'Customer notifications marked as read' });
  } catch (error: any) {
    console.error('Error marking customer notifications read:', error);
    res.status(500).json({ error: 'Failed to mark notifications read' });
  }
});

// 3. POST /api/notifications/admin/mark-orders-read - Mark admin new orders as viewed (Admin/Staff only)
router.post('/admin/mark-orders-read', authenticateToken, requireAdminOrStaff, async (req: Request, res: Response) => {
  try {
    const { orderIds } = req.body;
    const ids: string[] = Array.isArray(orderIds) ? orderIds : [];

    const { isConnected } = await getDbStatus();
    const now = new Date();

    if (isConnected) {
      const filter: any = {
        orderType: 'Online',
        status: 'Paid',
        adminViewed: { $ne: true }
      };
      if (ids.length > 0) {
        filter.id = { $in: ids };
      }
      await Order.updateMany(filter, {
        $set: { adminViewed: true, adminViewedAt: now }
      });
    } else {
      for (const order of memoryStore.orders) {
        if (
          order.orderType === 'Online' &&
          order.status === 'Paid' &&
          order.adminViewed !== true &&
          (ids.length === 0 || ids.includes(order.id))
        ) {
          order.adminViewed = true;
          order.adminViewedAt = now;
        }
      }
    }

    return res.json({ success: true, message: 'Admin orders marked as read' });
  } catch (error: any) {
    console.error('Error marking admin orders read:', error);
    res.status(500).json({ error: 'Failed to mark admin orders read' });
  }
});

// 4. POST /api/notifications/admin/acknowledge-inventory - Acknowledge low stock items (Admin/Staff only)
router.post('/admin/acknowledge-inventory', authenticateToken, requireAdminOrStaff, async (req: Request, res: Response) => {
  try {
    const { itemIds } = req.body;
    const ids: string[] = Array.isArray(itemIds) ? itemIds : [];

    const { isConnected } = await getDbStatus();
    const now = new Date();

    if (isConnected) {
      if (ids.length > 0) {
        await InventoryItem.updateMany(
          { id: { $in: ids } },
          { $set: { lowStockAcknowledged: true, lowStockAcknowledgedAt: now } }
        );
      } else {
        // Acknowledge all currently low-stock items
        const allItems = await InventoryItem.find({});
        for (const item of allItems) {
          const threshold = item.lowStockThreshold !== undefined ? item.lowStockThreshold : 10;
          if (item.quantity <= threshold) {
            item.lowStockAcknowledged = true;
            item.lowStockAcknowledgedAt = now;
            await item.save();
          }
        }
      }
    } else {
      for (const item of memoryStore.inventory) {
        const threshold = item.lowStockThreshold !== undefined ? item.lowStockThreshold : 10;
        if (ids.length === 0 ? item.quantity <= threshold : ids.includes(item.id)) {
          item.lowStockAcknowledged = true;
          item.lowStockAcknowledgedAt = now;
        }
      }
    }

    return res.json({ success: true, message: 'Low stock alerts acknowledged' });
  } catch (error: any) {
    console.error('Error acknowledging inventory alerts:', error);
    res.status(500).json({ error: 'Failed to acknowledge inventory alerts' });
  }
});

export default router;
