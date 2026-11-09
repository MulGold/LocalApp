import { getAuthHeaders } from './inventoryService';

export interface NotificationCounts {
  customerOrderUpdates: number;
  adminNewOrders: number;
  adminLowStock: number;
  lowStockItems: {
    id: string;
    name: string;
    quantity: number;
    unit: string;
    lowStockThreshold: number;
    acknowledged: boolean;
  }[];
}

// 1. Fetch current notification counts for user and admin
export async function fetchNotificationCounts(): Promise<NotificationCounts> {
  try {
    const res = await fetch('/api/notifications/counts', {
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch notifications (${res.status})`);
    }

    const data = await res.json();
    return {
      customerOrderUpdates: Number(data.customerOrderUpdates) || 0,
      adminNewOrders: Number(data.adminNewOrders) || 0,
      adminLowStock: Number(data.adminLowStock) || 0,
      lowStockItems: Array.isArray(data.lowStockItems) ? data.lowStockItems : []
    };
  } catch (error) {
    console.warn('Error fetching notification counts:', error);
    return {
      customerOrderUpdates: 0,
      adminNewOrders: 0,
      adminLowStock: 0,
      lowStockItems: []
    };
  }
}

// 2. Mark customer order notifications as read
export async function markCustomerNotificationsRead(orderIds?: string[]): Promise<boolean> {
  try {
    const targetOrderIds = orderIds || [];
    const res = await fetch('/api/notifications/customer/mark-read', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ orderIds: targetOrderIds })
    });

    return res.ok;
  } catch (error) {
    console.error('Error marking customer notifications read:', error);
    return false;
  }
}

// 3. Mark admin new orders as read
export async function markAdminOrdersRead(orderIds?: string[]): Promise<boolean> {
  try {
    const res = await fetch('/api/notifications/admin/mark-orders-read', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ orderIds: orderIds || [] })
    });

    return res.ok;
  } catch (error) {
    console.error('Error marking admin orders read:', error);
    return false;
  }
}

// 4. Acknowledge admin low stock inventory alerts
export async function acknowledgeAdminInventoryAlerts(itemIds?: string[]): Promise<boolean> {
  try {
    const res = await fetch('/api/notifications/admin/acknowledge-inventory', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ itemIds: itemIds || [] })
    });

    return res.ok;
  } catch (error) {
    console.error('Error acknowledging admin inventory alerts:', error);
    return false;
  }
}
