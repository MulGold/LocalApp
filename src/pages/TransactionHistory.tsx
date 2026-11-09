import { useState, useEffect } from 'react';
import { fetchOrders, removeOrder } from '../api/orderService';
import { useConfirm } from '../context/ConfirmContext';
import { AnimatePresence } from 'motion/react';
import { X, Receipt as ReceiptIcon, Search } from 'lucide-react';
import { formatPrice } from '../utils/format';
import { CustomSelect } from '../components/CustomSelect';
import { calculateTotalOrderQuantity, getAggregatedOrderItems, formatQuantityValue } from '../utils/orderItemUtils';

const TransactionHistory = () => {
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('Completed');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const confirm = useConfirm();

  const loadOrders = async () => {
    try {
      const data = await fetchOrders({ scope: 'history' });
      setMyOrders(data || []);
    } catch (err) {
      console.error('Failed to load transaction history:', err);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleDelete = async (orderId: string) => {
    const confirmed = await confirm({
      title: 'Delete Transaction?',
      message: 'Are you sure you want to delete this transaction from record?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive'
    });
    if (!confirmed) return;

    setMyOrders(prev => prev.filter(o => o.id !== orderId));
    await removeOrder(orderId);
    await loadOrders();
  };

  // Apply Search and Filter logic
  const filteredOrders = myOrders.filter(order => {
    // Transaction History strictly allows only Completed or admin/staff-declined orders
    const isHistoryEligible = 
      order.status === 'Completed' || 
      (order.status === 'Cancelled' && (order.cancelledBy === 'admin' || order.cancelledBy === 'staff'));

    if (!isHistoryEligible) return false;

    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      order.id.toLowerCase().includes(searchLower) || 
      (order.customer?.name && order.customer.name.toLowerCase().includes(searchLower));

    const matchesStatus = filterStatus === 'All' || order.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Search and Filter Controls */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Search by Order ID or Customer Name..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-xs font-medium focus:outline-none focus:border-dark text-dark"
            />
          </div>
          <CustomSelect 
            value={filterStatus}
            onChange={(val) => setFilterStatus(val)}
            options={[
              { value: 'All', label: 'All Transactions' },
              { value: 'Completed', label: 'Completed' },
              { value: 'Cancelled', label: 'Cancelled (Admin Declined)' }
            ]}
            className="w-full md:w-auto shrink-0"
            triggerClassName="w-full md:w-auto bg-gray-50 border border-gray-300 px-3 py-2 rounded-lg text-xs font-bold text-dark hover:border-dark focus:outline-none cursor-pointer"
          />
        </div>

        {/* Order List */}
        <div className="space-y-3">
          {filteredOrders.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
              <p className="text-gray-500 font-medium text-xs">No transactions found matching your criteria.</p>
            </div>
          ) : (
            filteredOrders.map(order => (
              <div key={order.id} className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 hover:border-dark transition-colors flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div className="flex flex-1 gap-3.5 items-start">
                  <div className="bg-gray-100 p-2.5 rounded-lg border border-gray-200 text-gray-700 shrink-0">
                    <ReceiptIcon size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-gray-500">{order.id}</span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                        order.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' :
                        order.status === 'Cancelled' ? 'bg-red-50 text-red-700 border-red-200' :
                        order.status === 'Cooking' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                        order.status === 'Processing' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        (order.status === 'Ready for Pickup' || order.status === 'Ready to Pickup') ? 'bg-purple-50 text-purple-700 border-purple-200' :
                        order.status === 'On Delivery' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                        'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {order.status === 'Cooking' ? 'Cooking 🍳' : (order.status === 'Ready to Pickup' ? 'Ready for Pickup' : order.status)}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-dark">{order.customer.name}</h4>
                    <p className="text-xs text-gray-500">
                      {new Date(order.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between md:justify-end gap-4 pt-3 md:pt-0 border-t md:border-t-0 border-gray-100">
                  <div className="flex items-center">
                    <button 
                      onClick={() => setSelectedOrder(order)}
                      className="px-3.5 py-1.5 bg-white border border-gray-300 text-dark hover:bg-dark hover:text-white hover:border-dark rounded-lg transition-colors text-xs font-bold uppercase tracking-wider"
                    >
                      View
                    </button>
                  </div>

                  {order.paymentScreenshot && (
                    <button 
                      onClick={() => setPreviewImage(order.paymentScreenshot)}
                      className="relative block shrink-0"
                    >
                      <div className="w-10 h-10 rounded-lg overflow-hidden border border-gray-200">
                        <img 
                          src={order.paymentScreenshot} 
                          alt="Receipt" 
                          className="w-full h-full object-cover" 
                        />
                      </div>
                    </button>
                  )}
                  <div className="flex flex-col sm:items-end">
                    <p className="text-base font-black text-dark">{formatPrice(order.total)}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{calculateTotalOrderQuantity(order.items || [])} Item(s) • {order.paymentMethod}</p>
                  </div>
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
                className="absolute inset-0 bg-black/50"
              />
              <div
                className="bg-white w-full max-w-lg rounded-xl border border-gray-200 relative z-10 overflow-hidden flex flex-col"
              >
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                  <div>
                    <h3 className="font-bold text-dark text-xs uppercase tracking-wider">Transaction Details</h3>
                    <p className="text-[10px] font-mono text-gray-500">{selectedOrder.id}</p>
                  </div>
                  <button 
                    onClick={() => setSelectedOrder(null)}
                    className="text-gray-400 hover:text-dark"
                  >
                    <X size={18} />
                  </button>
                </div>
                
                <div className="p-5 max-h-[60vh] overflow-y-auto space-y-4">
                  <div className="divide-y divide-gray-100">
                    {getAggregatedOrderItems(selectedOrder.items || []).map((item: any, idx: number) => (
                      <div key={idx} className="py-2.5 flex gap-3 items-center">
                        <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden shrink-0">
                          <img 
                            src={item.image || 'https://picsum.photos/seed/food/200/200'} 
                            alt={item.name} 
                            className="w-full h-full object-cover" 
                          />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-bold text-dark text-xs">{item.name}</h4>
                          <p className="text-[11px] text-gray-500">{formatPrice(item.price)} × {formatQuantityValue(item.quantity)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-dark text-xs">{formatPrice(item.price * item.quantity)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="pt-3 border-t border-gray-200 flex justify-between items-end">
                    <div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Status</p>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                        selectedOrder.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' :
                        selectedOrder.status === 'Cancelled' ? 'bg-red-50 text-red-700 border-red-200' :
                        selectedOrder.status === 'Cooking' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                        selectedOrder.status === 'Processing' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        (selectedOrder.status === 'Ready for Pickup' || selectedOrder.status === 'Ready to Pickup') ? 'bg-purple-50 text-purple-700 border-purple-200' :
                        'bg-gray-100 text-gray-700 border-gray-200'
                      }`}>
                        {selectedOrder.status === 'Cooking' ? 'Cooking 🍳' : (selectedOrder.status === 'Ready to Pickup' ? 'Ready for Pickup' : selectedOrder.status)}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Total Bill</p>
                      <p className="text-xl font-black text-dark">{formatPrice(selectedOrder.total)}</p>
                    </div>
                  </div>
                </div>
                
                <div className="p-3 bg-gray-50 border-t border-gray-200 text-center">
                  <p className="text-[10px] text-gray-500 font-medium">Ordered on {new Date(selectedOrder.date).toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Image Preview Modal */}
        <AnimatePresence>
          {previewImage && (
            <div 
              className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
              onClick={() => setPreviewImage(null)}
            >
              <button 
                className="absolute top-4 right-4 text-white hover:text-gray-300 p-2"
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
    </div>
  );
};

export default TransactionHistory;
