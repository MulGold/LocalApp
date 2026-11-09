import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { 
  fetchNotificationCounts, 
  markCustomerNotificationsRead, 
  markAdminOrdersRead, 
  acknowledgeAdminInventoryAlerts,
  NotificationCounts 
} from '../api/notificationService';
import { AuthContext } from './AuthContext';

interface NotificationContextType {
  customerOrderUpdates: number;
  adminNewOrders: number;
  adminLowStock: number;
  lowStockItems: NotificationCounts['lowStockItems'];
  refreshNotifications: () => Promise<void>;
  markCustomerOrdersRead: (orderIds?: string[]) => Promise<void>;
  markAdminOrdersAsRead: (orderIds?: string[]) => Promise<void>;
  acknowledgeLowStock: (itemIds?: string[]) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>({
  customerOrderUpdates: 0,
  adminNewOrders: 0,
  adminLowStock: 0,
  lowStockItems: [],
  refreshNotifications: async () => {},
  markCustomerOrdersRead: async () => {},
  markAdminOrdersAsRead: async () => {},
  acknowledgeLowStock: async () => {}
});

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useContext(AuthContext) as any;
  const isFetchingRef = useRef(false);
  const [counts, setCounts] = useState<NotificationCounts>({
    customerOrderUpdates: 0,
    adminNewOrders: 0,
    adminLowStock: 0,
    lowStockItems: []
  });

  const isAdminOrStaff = user?.role === 'admin' || user?.role === 'staff';

  const refreshNotifications = useCallback(async () => {
    if (!isAdminOrStaff) return;
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const data = await fetchNotificationCounts();
      setCounts(data);
    } catch (err) {
      console.warn('Error refreshing notifications:', err);
    } finally {
      isFetchingRef.current = false;
    }
  }, [isAdminOrStaff]);

  // Poll notifications automatically without excessive requests or overlapping
  useEffect(() => {
    if (!isAdminOrStaff) {
      setCounts({
        customerOrderUpdates: 0,
        adminNewOrders: 0,
        adminLowStock: 0,
        lowStockItems: []
      });
      return;
    }

    refreshNotifications();

    const interval = setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        refreshNotifications();
      }
    }, 25000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshNotifications();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAdminOrStaff, refreshNotifications]);

  const markCustomerOrdersReadHandler = async (orderIds?: string[]) => {
    // Optimistically update UI
    setCounts(prev => ({ ...prev, customerOrderUpdates: 0 }));
    await markCustomerNotificationsRead(orderIds);
  };

  const markAdminOrdersAsReadHandler = async (orderIds?: string[]) => {
    // Optimistically update UI
    setCounts(prev => ({ ...prev, adminNewOrders: 0 }));
    await markAdminOrdersRead(orderIds);
    await refreshNotifications();
  };

  const acknowledgeLowStockHandler = async (itemIds?: string[]) => {
    // Optimistically update UI
    setCounts(prev => ({ ...prev, adminLowStock: 0 }));
    await acknowledgeAdminInventoryAlerts(itemIds);
    await refreshNotifications();
  };

  return (
    <NotificationContext.Provider
      value={{
        customerOrderUpdates: counts.customerOrderUpdates,
        adminNewOrders: counts.adminNewOrders,
        adminLowStock: counts.adminLowStock,
        lowStockItems: counts.lowStockItems,
        refreshNotifications,
        markCustomerOrdersRead: markCustomerOrdersReadHandler,
        markAdminOrdersAsRead: markAdminOrdersAsReadHandler,
        acknowledgeLowStock: acknowledgeLowStockHandler
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => useContext(NotificationContext);
