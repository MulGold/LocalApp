import { useState, useEffect, useContext, useRef } from 'react';
import { Link } from 'react-router-dom';
import { fetchOrders, removeOrder } from '../api/orderService';
import { AuthContext } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';
import { Search, Clock, X, Utensils } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatPrice } from '../utils/format';
import { calculateTotalOrderQuantity, getAggregatedOrderItems, formatQuantityValue } from '../utils/orderItemUtils';

const CustomerOrderHistory = () => {
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const { user } = useContext(AuthContext) as any;
  const { markCustomerOrdersRead } = useNotifications();
  const confirm = useConfirm();
  const hasMarkedReadRef = useRef(false);
  const isFetchingRef = useRef(false);

  const loadOrders = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      if (!user?.email) {
        setMyOrders([]);
        return;
      }

      // Request customer's relevant orders from the backend (server enforces customer scope)
      const fetchedOrders = await fetchOrders();
      
      const userOrders = (fetchedOrders || []).filter(order => order.status !== 'Pending');
      
      userOrders.sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());
      setMyOrders(userOrders);

      // Keep currently viewed modal order in sync with latest backend status
      setSelectedOrder((currentSelected: any) => {
        if (!currentSelected) return null;
        const updated = userOrders.find(o => o.id === currentSelected.id);
        return updated || currentSelected;
      });

      // When the customer opens Order History and the relevant new updates are displayed,
      // mark those notifications as read and remove the badge.
      if (userOrders.length > 0 && !hasMarkedReadRef.current) {
        hasMarkedReadRef.current = true;
        markCustomerOrdersRead(userOrders.map(o => o.id));
      }
    } catch (err) {
      console.error('Failed to load customer orders:', err);
    } finally {
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
    }, 5000);

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
  }, [user]);

  const handleDelete = async (orderId: string) => {
    const confirmed = await confirm({
      title: 'Delete Order?',
      message: 'Are you sure you want to delete this order from your history?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive'
    });
    if (!confirmed) return;

    setMyOrders(prev => prev.filter(o => o.id !== orderId));
    await removeOrder(orderId);
    await loadOrders();
  };

  const filteredOrders = myOrders.filter(order => 
    order.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-4xl py-6 sm:py-8">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-black text-dark tracking-tight">My Orders</h1>
        <p className="text-xs sm:text-sm text-gray-500 font-medium">Track your pickup orders and preparation status</p>
      </div>

      {/* Search Box */}
      {myOrders.length > 0 && (
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Search by Order ID..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-dark transition-colors text-sm font-medium text-dark"
          />
        </div>
      )}

      {/* Order List */}
      <div className="space-y-4">
        {myOrders.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
            <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
              <Clock size={28} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-dark mb-1">No Orders Found</h3>
            <p className="text-gray-500 text-xs max-w-xs mx-auto mb-4">You haven't completed any pickup orders yet. Start ordering to track your history here!</p>
            <Link 
              to="/menu" 
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 transition-colors shadow-2xs"
            >
              <Utensils size={14} />
              <span>Browse Menu</span>
            </Link>
          </div>
        ) : filteredOrders.length === 0 ? (
          <p className="text-gray-500 p-8 text-center bg-white rounded-xl border border-gray-200 text-sm">No orders match your search.</p>
        ) : (
          filteredOrders.map(order => (
            <div key={order.id} className="bg-white p-5 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors flex flex-col md:flex-row justify-between md:items-center gap-4">
              <div className="flex gap-3.5 items-start">
                <div className="bg-gray-100 p-3 rounded-lg text-gray-700 shrink-0">
                  <Utensils size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-bold text-gray-400 uppercase">{order.id}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                      order.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' :
                      order.status === 'Cancelled' ? 'bg-red-50 text-red-700 border-red-200' :
                      order.status === 'Cooking' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                      order.status === 'Processing' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      (order.status === 'Ready for Pickup' || order.status === 'Ready to Pickup') ? 'bg-purple-50 text-purple-700 border-purple-200' :
                      'bg-yellow-50 text-yellow-700 border-yellow-200'
                    }`}>
                      {order.status === 'Cooking' ? 'Cooking 🍳' : 
                       (order.status === 'Ready for Pickup' || order.status === 'Ready to Pickup') ? 'Ready for Pickup 🛍️' : 
                       order.status}
                    </span>
                  </div>
                  <h4 className="font-black text-base text-dark">{formatPrice(order.total)}</h4>
                  <p className="text-xs text-gray-500">
                    {new Date(order.date || order.createdAt).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                  {(order.status === 'Ready for Pickup' || order.status === 'Ready to Pickup') && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-purple-50 text-purple-800 text-[11px] font-bold rounded-md border border-purple-200">
                      <span>🛍️ Ready to collect at counter!</span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex flex-row md:flex-col md:items-end justify-between items-center gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-gray-100">
                <div className="flex items-center">
                  <button 
                    onClick={() => setSelectedOrder(order)}
                    className="px-3.5 py-1.5 bg-gray-50 text-dark hover:bg-dark hover:text-white rounded-lg transition-colors border border-gray-200 text-xs font-bold uppercase tracking-wider"
                  >
                    View
                  </button>
                </div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{calculateTotalOrderQuantity(order.items || [])} Item(s)</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Order Detail Modal */}
      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
              onClick={() => setSelectedOrder(null)}
              className="absolute inset-0 bg-black/40"
            />
            <div className="bg-white w-full max-w-lg rounded-xl border border-gray-200 relative z-10 overflow-hidden">
              <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                <div>
                  <h3 className="font-bold text-dark text-sm">Order Details</h3>
                  <p className="text-xs font-mono text-gray-400 uppercase">{selectedOrder.id}</p>
                </div>
                <button 
                  onClick={() => setSelectedOrder(null)}
                  className="p-1.5 hover:bg-gray-200 rounded-md transition-colors text-gray-500"
                >
                  <X size={18} />
                </button>
              </div>
              
              <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                <div className="divide-y divide-gray-100">
                  {getAggregatedOrderItems(selectedOrder.items || []).map((item: any, idx: number) => (
                    <div key={idx} className="flex gap-3 items-center py-2.5 first:pt-0">
                      <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden shrink-0 border border-gray-100">
                        <img 
                          src={item.image || 'https://picsum.photos/seed/food/200/200'} 
                          alt={item.name} 
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-dark text-xs truncate">{item.name}</h4>
                        <p className="text-xs text-gray-500">{formatPrice(item.price)} × {formatQuantityValue(item.quantity)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-dark text-xs">{formatPrice(item.price * item.quantity)}</p>
                      </div>
                    </div>
                  ))}
                </div>
                
                {selectedOrder.status === 'Cancelled' && (
                  <div className="bg-red-50 p-3.5 rounded-lg border border-red-200 text-red-800 text-xs flex items-center gap-2 font-medium">
                    <X size={16} className="shrink-0 text-red-600" />
                    <span>This order was cancelled and will not be prepared or charged.</span>
                  </div>
                )}

                {selectedOrder.status !== 'Cancelled' && (
                  <div className="bg-gray-50/80 p-3.5 rounded-lg border border-gray-200">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Order Preparation Progress</p>
                    <div className="grid grid-cols-4 gap-1.5 text-center">
                      <div className={`p-2 rounded-lg border text-[11px] font-bold transition-all ${
                        ['Processing', 'Cooking', 'Ready for Pickup', 'Ready to Pickup', 'Completed'].includes(selectedOrder.status)
                          ? selectedOrder.status === 'Processing'
                            ? 'bg-blue-50 text-blue-800 border-blue-300 ring-2 ring-blue-200'
                            : 'bg-white text-gray-700 border-gray-200'
                          : 'bg-gray-100 text-gray-400 border-gray-200'
                      }`}>
                        <span className="block text-[9px] uppercase font-bold text-gray-400">Step 1</span>
                        <span>Processing</span>
                      </div>
                      <div className={`p-2 rounded-lg border text-[11px] font-bold transition-all ${
                        ['Cooking', 'Ready for Pickup', 'Ready to Pickup', 'Completed'].includes(selectedOrder.status)
                          ? selectedOrder.status === 'Cooking'
                            ? 'bg-orange-50 text-orange-800 border-orange-300 ring-2 ring-orange-200 animate-pulse'
                            : 'bg-white text-gray-700 border-gray-200'
                          : 'bg-gray-100 text-gray-400 border-gray-200'
                      }`}>
                        <span className="block text-[9px] uppercase font-bold text-gray-400">Step 2</span>
                        <span>Cooking 🍳</span>
                      </div>
                      <div className={`p-2 rounded-lg border text-[11px] font-bold transition-all ${
                        ['Ready for Pickup', 'Ready to Pickup', 'Completed'].includes(selectedOrder.status)
                          ? (selectedOrder.status === 'Ready for Pickup' || selectedOrder.status === 'Ready to Pickup')
                            ? 'bg-purple-50 text-purple-800 border-purple-300 ring-2 ring-purple-200'
                            : 'bg-white text-gray-700 border-gray-200'
                          : 'bg-gray-100 text-gray-400 border-gray-200'
                      }`}>
                        <span className="block text-[9px] uppercase font-bold text-gray-400">Step 3</span>
                        <span>Ready for Pickup 🛍️</span>
                      </div>
                      <div className={`p-2 rounded-lg border text-[11px] font-bold transition-all ${
                        selectedOrder.status === 'Completed'
                          ? 'bg-green-50 text-green-800 border-green-300 ring-2 ring-green-200'
                          : 'bg-gray-100 text-gray-400 border-gray-200'
                      }`}>
                        <span className="block text-[9px] uppercase font-bold text-gray-400">Step 4</span>
                        <span>Completed</span>
                      </div>
                    </div>
                  </div>
                )}

                {(selectedOrder.status === 'Ready for Pickup' || selectedOrder.status === 'Ready to Pickup') && (
                  <div className="bg-purple-50 p-4 rounded-xl border-2 border-dashed border-purple-300 text-center">
                    <span className="text-2xl block mb-1">🛍️</span>
                    <h5 className="text-xs font-black text-purple-900 uppercase tracking-wider mb-1">Your Order is Ready for Pickup!</h5>
                    <p className="text-xs text-purple-800 font-medium leading-relaxed">
                      Your items have been prepared and packed. Please present your Order ID <strong className="font-mono text-purple-950 font-bold">#{selectedOrder.id}</strong> to our staff at the counter to collect your order.
                    </p>
                  </div>
                )}

                {/* Detailed Order Metadata */}
                <div className="bg-gray-50/70 p-3.5 rounded-lg border border-gray-200 text-xs grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Order Type</span>
                    <span className="font-bold text-dark">{selectedOrder.orderType || 'Online'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Payment Method</span>
                    <span className="font-bold text-dark">{selectedOrder.paymentMethod || 'Cash'} ({selectedOrder.paymentStatus || 'Unpaid'})</span>
                  </div>
                  {selectedOrder.customer?.name && (
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Customer Name</span>
                      <span className="font-bold text-dark truncate block">{selectedOrder.customer.name}</span>
                    </div>
                  )}
                  {selectedOrder.customer?.phone && (
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Contact Phone</span>
                      <span className="font-bold text-dark">{selectedOrder.customer.phone}</span>
                    </div>
                  )}
                </div>
                
                <div className="pt-4 border-t border-gray-200 flex justify-between items-end">
                   <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Status</p>
                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                      selectedOrder.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' :
                      selectedOrder.status === 'Cancelled' ? 'bg-red-50 text-red-700 border-red-200' :
                      selectedOrder.status === 'Cooking' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                      selectedOrder.status === 'Processing' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      (selectedOrder.status === 'Ready for Pickup' || selectedOrder.status === 'Ready to Pickup') ? 'bg-purple-50 text-purple-700 border-purple-200' :
                      'bg-primary/10 text-primary border-primary/20'
                    }`}>
                      {selectedOrder.status === 'Cooking' ? 'Cooking 🍳' : 
                       (selectedOrder.status === 'Ready for Pickup' || selectedOrder.status === 'Ready to Pickup') ? 'Ready for Pickup 🛍️' : 
                       selectedOrder.status}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Total Bill</p>
                    <p className="text-2xl font-black text-primary tracking-tight">{formatPrice(selectedOrder.total)}</p>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-gray-50 border-t border-gray-200 text-center">
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Ordered on {new Date(selectedOrder.date || selectedOrder.createdAt).toLocaleString()}</p>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CustomerOrderHistory;
