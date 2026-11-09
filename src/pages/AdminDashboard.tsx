import { useState, useEffect, useRef } from 'react';
import { fetchOrders, modifyOrderStatus } from '../api/orderService';
import { useNotifications } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';
import { X, Eye, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatPrice } from '../utils/format';
import { calculateTotalOrderQuantity, getAggregatedOrderItems, formatQuantityValue } from '../utils/orderItemUtils';

const AdminDashboard = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('Pending');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingOrders, setUpdatingOrders] = useState<Record<string, string>>({});
  const { markAdminOrdersAsRead } = useNotifications();
  const confirm = useConfirm();
  const hasMarkedReadRef = useRef(false);
  const isFetchingRef = useRef(false);

  const loadOrders = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const data = await fetchOrders({ scope: 'manage' });
      const orderList = data || [];
      setOrders(orderList);

      // If there are unread orders and this page is visited, mark them as read
      const hasUnread = orderList.some((o: any) => o.adminViewed === false || !o.adminViewed);
      if (hasUnread && !hasMarkedReadRef.current) {
        hasMarkedReadRef.current = true;
        markAdminOrdersAsRead();
      }
    } catch (err) {
      console.error('Failed to load orders in AdminDashboard:', err);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    hasMarkedReadRef.current = false;
    loadOrders();

    const interval = setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        loadOrders();
      }
    }, 20000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadOrders();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    if (updatingOrders[orderId]) return;

    // If order is already cancelled, don't allow proceeding to another status
    const targetOrder = orders.find(o => o.id === orderId);
    if (targetOrder?.status === 'Cancelled') {
      alert('This order has been cancelled and cannot proceed to another status.');
      return;
    }

    setUpdatingOrders(prev => ({ ...prev, [orderId]: newStatus }));

    try {
      await modifyOrderStatus(orderId, newStatus);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      await loadOrders();
    } catch (err: any) {
      console.error('Failed to update status:', err);
      alert(err?.message || 'Failed to update order status.');
      await loadOrders();
    } finally {
      setUpdatingOrders(prev => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    }
  };

  const handleCancelPendingOrder = async (orderId: string) => {
    if (updatingOrders[orderId]) return;

    const confirmed = await confirm({
      title: 'Cancel Order?',
      message: `Are you sure you want to cancel order ${orderId}?`,
      confirmText: 'Cancel Order',
      cancelText: 'Keep Order',
      variant: 'destructive'
    });
    if (!confirmed) {
      return;
    }
    setUpdatingOrders(prev => ({ ...prev, [orderId]: 'Cancelled' }));
    try {
      await modifyOrderStatus(orderId, 'Cancelled');
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'Cancelled' } : o));
      await loadOrders();
    } catch (err: any) {
      console.error('Failed to cancel order:', err);
      alert(err?.message || 'Failed to cancel order.');
      await loadOrders();
    } finally {
      setUpdatingOrders(prev => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    }
  };

  const filteredOrders = orders.filter(order => {
    const searchLower = searchTerm.toLowerCase();
    const customerEmail = (order.customer?.email && order.customer.email !== 'anonymous')
      ? order.customer.email
      : (order.userEmail && order.userEmail !== 'anonymous' ? order.userEmail : '');

    const matchesSearch = 
      order.id.toLowerCase().includes(searchLower) || 
      (order.customer?.name && order.customer.name.toLowerCase().includes(searchLower)) ||
      (customerEmail && customerEmail.toLowerCase().includes(searchLower)) ||
      (order.customer?.phone && order.customer.phone.toLowerCase().includes(searchLower));
      
    let matchesStatus = false;
    if (filterStatus === 'Pending') {
      matchesStatus = order.status === 'Paid';
    } else if (filterStatus === 'Processing') {
      matchesStatus = order.status === 'Processing';
    } else if (filterStatus === 'Cooking') {
      matchesStatus = order.status === 'Cooking';
    } else if (filterStatus === 'Ready for Pickup') {
      matchesStatus = order.status === 'Ready for Pickup' || order.status === 'Ready to Pickup';
    } else if (filterStatus === 'All') {
      matchesStatus = ['Paid', 'Processing', 'Cooking', 'Ready for Pickup', 'Ready to Pickup'].includes(order.status);
    }
    
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Pending':
      case 'Paid': return 'bg-yellow-50 text-yellow-800 border-yellow-200';
      case 'Processing': return 'bg-indigo-50 text-indigo-800 border-indigo-200';
      case 'Cooking': return 'bg-orange-50 text-orange-800 border-orange-200';
      case 'Ready for Pickup':
      case 'Ready to Pickup': return 'bg-purple-50 text-purple-800 border-purple-200';
      case 'Completed': return 'bg-green-50 text-green-800 border-green-200';
      case 'Cancelled': return 'bg-red-50 text-red-800 border-red-200';
      default: return 'bg-gray-50 text-gray-800 border-gray-200';
    }
  };

  const getCustomerInitials = (customerName?: string, status: string = ''): string => {
    const name = customerName?.trim();
    if (!name) {
      return status === 'Cooking' ? '🍳' : (status.charAt(0) || 'C');
    }
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return status === 'Cooking' ? '🍳' : (status.charAt(0) || 'C');
    }
    return parts.map(p => p.charAt(0).toUpperCase()).join('');
  };

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap gap-1.5 w-full mb-6">
          {['Pending', 'Processing', 'Cooking', 'Ready for Pickup', 'All'].map(status => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors border ${
                  filterStatus === status 
                    ? 'bg-dark text-white border-dark' 
                    : 'bg-white text-gray-600 border-gray-200 hover:border-dark hover:text-dark'
                }`}
              >
                {status === 'Cooking' ? 'Cooking 🍳' : status}
              </button>
            ))}
        </div>
        
        {/* Search Bar */}
        <div className="bg-white p-2 rounded-xl border border-gray-200 mb-6 flex items-center">
            <input 
              type="text" 
              placeholder="Search by Order ID, customer name, email, or phone number..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border-none focus:outline-none text-dark font-medium text-sm placeholder:text-gray-400"
            />
        </div>

        <div className="grid gap-4">
          {filteredOrders.length === 0 ? (
            <div className="bg-white p-12 rounded-xl border border-gray-200 text-center">
              <p className="text-gray-400 text-sm font-bold uppercase tracking-wider">No Orders Found</p>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const orderDate = order.date || order.createdAt;
              const formattedDate = orderDate ? new Date(orderDate).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              }) : 'N/A';

              return (
                <div key={order.id} className="bg-white p-5 sm:p-6 rounded-xl border border-gray-200 flex flex-col xl:flex-row xl:items-stretch gap-6 hover:border-gray-300 transition-colors">
                  <div className="flex gap-4 items-start flex-1">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 border font-black text-lg ${getStatusColor(order.status)}`}>
                      {getCustomerInitials(order.customer?.name || order.userName, order.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-lg font-black text-dark tracking-tight">{order.customer?.name || 'Customer'}</h3>
                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(order.status)}`}>
                          {order.status === 'Paid' ? 'Pending' : (order.status === 'Cooking' ? 'Cooking 🍳' : (order.status === 'Ready to Pickup' ? 'Ready for Pickup' : order.status))}
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mb-3 font-medium">
                        <span className="font-mono font-bold text-gray-600">ID: {order.id}</span>
                        <span>•</span>
                        <span>Date: <strong className="text-dark">{formattedDate}</strong></span>
                        {order.orderType && (
                          <>
                            <span>•</span>
                            <span className="uppercase text-[10px] font-bold bg-gray-100 px-2 py-0.5 rounded border border-gray-200 text-dark">{order.orderType}</span>
                          </>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-gray-50 p-3 rounded-lg border border-gray-200 mb-4 max-w-lg">
                        <div>
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Customer Phone</p>
                          <p className="text-xs font-bold text-dark">{order.customer?.phone || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Customer Email</p>
                          <p className="text-xs font-bold text-dark truncate">
                            {(order.customer?.email && order.customer.email !== 'anonymous' && order.customer.email.trim() !== '')
                              ? order.customer.email
                              : ((order.userEmail && order.userEmail !== 'anonymous' && order.userEmail.trim() !== '') ? order.userEmail : 'N/A')}
                          </p>
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Ordered Products ({calculateTotalOrderQuantity(order.items || [])})</p>
                        <div className="flex flex-wrap gap-1.5">
                          {getAggregatedOrderItems(order.items || []).map((item: any, idx: number) => (
                            <div key={`${item.id || item.name}-${idx}`} className="bg-gray-50 px-2.5 py-1 rounded-md text-xs font-bold border border-gray-200 flex items-center gap-1.5 text-dark">
                              <span>{item.name} ×{formatQuantityValue(item.quantity)}</span>
                              {item.price && (
                                <span className="text-gray-400 text-[11px] font-normal">({formatPrice(item.price * item.quantity)})</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Receipt and Actions */}
                  <div className="flex flex-col sm:flex-row xl:flex-col justify-between gap-4 sm:items-center xl:items-end p-4 bg-gray-50 rounded-lg shrink-0 border border-gray-200">
                    <div className="flex gap-4 items-center">
                      {order.paymentScreenshot ? (
                        <button 
                          onClick={() => setPreviewImage(order.paymentScreenshot)}
                          className="group/receipt relative block"
                          title="Click to view full payment receipt screenshot"
                        >
                          <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-300 bg-white">
                            <img 
                              src={order.paymentScreenshot} 
                              alt="Receipt" 
                              className="w-full h-full object-cover" 
                            />
                          </div>
                          <div className="absolute inset-0 bg-dark/60 opacity-0 group-hover/receipt:opacity-100 transition-opacity rounded-lg flex flex-col items-center justify-center">
                            <Eye className="text-white mb-0.5" size={14} />
                            <span className="text-[9px] text-white font-bold uppercase tracking-wider">View</span>
                          </div>
                        </button>
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-gray-100 border border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 gap-0.5">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-center">No Receipt</span>
                        </div>
                      )}
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Total Amount</p>
                        <p className="text-2xl font-black text-primary tracking-tight">{formatPrice(order.total)}</p>
                        <p className="text-[10px] font-bold text-gray-500 uppercase">{order.paymentMethod || 'GCash'}</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-1.5 w-full sm:w-44">
                      {order.status === 'Pending' && (
                        <div className="flex flex-col gap-1.5 w-full">
                          <div className="text-[10px] font-bold text-yellow-800 bg-yellow-100/80 border border-yellow-200 py-2 px-3 rounded-lg text-center uppercase tracking-wider">
                            Awaiting Payment
                          </div>
                          <button 
                            type="button"
                            id={`btn-cancel-pending-${order.id}`}
                            disabled={Boolean(updatingOrders[order.id])}
                            onClick={() => handleCancelPendingOrder(order.id)}
                            className="bg-white text-red-600 border border-red-200 hover:bg-red-50 hover:border-red-300 py-2 px-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors text-center flex items-center justify-center gap-1.5 shadow-sm active:translate-y-0.5 disabled:opacity-50"
                          >
                            {updatingOrders[order.id] === 'Cancelled' ? (
                              <>
                                <RefreshCw size={13} className="animate-spin" />
                                <span>Cancelling...</span>
                              </>
                            ) : (
                              <>
                                <X size={13} />
                                <span>Cancel Order</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                      {order.status === 'Paid' && (
                        <button 
                          id={`btn-process-order-${order.id}`}
                          disabled={Boolean(updatingOrders[order.id])}
                          onClick={() => handleStatusChange(order.id, 'Processing')}
                          className="bg-dark text-white px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-primary transition-colors text-center flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {updatingOrders[order.id] === 'Processing' ? (
                            <>
                              <RefreshCw size={16} className="animate-spin" />
                              <span>Processing...</span>
                            </>
                          ) : (
                            <span>Process Order</span>
                          )}
                        </button>
                      )}
                      {order.status === 'Processing' && (
                        <button 
                          id={`btn-move-cooking-${order.id}`}
                          disabled={Boolean(updatingOrders[order.id])}
                          onClick={() => handleStatusChange(order.id, 'Cooking')}
                          className="bg-orange-600 text-white px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-orange-700 transition-colors text-center flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {updatingOrders[order.id] === 'Cooking' ? (
                            <>
                              <RefreshCw size={16} className="animate-spin" />
                              <span>Moving to Cooking...</span>
                            </>
                          ) : (
                            <>
                              <span>Move to Cooking</span>
                              <span>🍳</span>
                            </>
                          )}
                        </button>
                      )}
                      {order.status === 'Cooking' && (
                        <button 
                          id={`btn-ready-pickup-${order.id}`}
                          disabled={Boolean(updatingOrders[order.id])}
                          onClick={() => handleStatusChange(order.id, 'Ready for Pickup')}
                          className="bg-purple-600 text-white px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-purple-700 transition-colors text-center flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {updatingOrders[order.id] === 'Ready for Pickup' ? (
                            <>
                              <RefreshCw size={16} className="animate-spin" />
                              <span>Preparing...</span>
                            </>
                          ) : (
                            <span>Ready for Pickup</span>
                          )}
                        </button>
                      )}
                      {(order.status === 'Ready for Pickup' || order.status === 'Ready to Pickup') && (
                        <button 
                          id={`btn-mark-collected-${order.id}`}
                          disabled={Boolean(updatingOrders[order.id])}
                          onClick={() => handleStatusChange(order.id, 'Completed')}
                          className="bg-green-600 text-white px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-green-700 transition-colors text-center flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {updatingOrders[order.id] === 'Completed' ? (
                            <>
                              <RefreshCw size={16} className="animate-spin" />
                              <span>Marking Collected...</span>
                            </>
                          ) : (
                            <span>Mark Collected</span>
                          )}
                        </button>
                      )}
                      {order.status === 'Paid' && (
                        <button 
                          id={`btn-decline-order-${order.id}`}
                          disabled={Boolean(updatingOrders[order.id])}
                          onClick={async () => {
                            const confirmed = await confirm({
                              title: 'Decline Transaction?',
                              message: `Are you sure you want to decline and cancel order ${order.id}?`,
                              confirmText: 'Decline & Cancel',
                              cancelText: 'Keep Order',
                              variant: 'destructive'
                            });
                            if (confirmed) {
                              handleStatusChange(order.id, 'Cancelled');
                            }
                          }}
                          className="text-gray-500 hover:text-red-600 text-[10px] font-bold uppercase tracking-wider py-1 text-center transition-colors disabled:opacity-50"
                        >
                          Decline Transaction
                        </button>
                      )}
                      {order.status === 'Cancelled' && (
                        <div className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 py-2 px-3 rounded-lg text-center uppercase tracking-wider">
                          Cancelled
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Image Preview Modal */}
      <AnimatePresence>
        {previewImage && (
          <div 
            className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 md:p-8"
            onClick={() => setPreviewImage(null)}
          >
            <button 
              className="absolute top-4 right-4 text-white hover:text-gray-300 bg-dark/80 p-2 rounded-lg transition-colors"
              onClick={() => setPreviewImage(null)}
            >
              <X size={24} />
            </button>
            <div
              className="max-w-full max-h-full sm:max-w-2xl bg-white p-2 rounded-xl border border-gray-200"
              onClick={(e) => e.stopPropagation()}
            >
              <img 
                src={previewImage} 
                alt="Receipt Preview" 
                className="max-w-full max-h-[80vh] object-contain rounded-lg"
              />
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminDashboard;