import { useState, useEffect, useRef } from 'react';
import { fetchOrders, modifyOrderStatus } from '../api/orderService';
import { CreditCard, CheckCircle2, Eye, User, Phone, MapPin, Facebook, X, AlertCircle, RefreshCw } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { formatPrice } from '../utils/format';

const CustomerPayment = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  const loadOrders = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const allOrders = await fetchOrders();
      const paymentOrders = allOrders.filter(order => 
        order.status === 'On Delivery'
      );
      setOrders(paymentOrders);
    } catch (err) {
      console.error('Failed to load customer payment orders:', err);
    } finally {
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
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
  }, []);

  const handleConfirmPayment = async (orderId: string) => {
    if (isProcessingPayment) return;
    setIsProcessingPayment(true);
    setPaymentError(null);

    try {
      await modifyOrderStatus(orderId, 'Completed');
      setSelectedOrder(null);
      await loadOrders();
    } catch (err: any) {
      console.error('Failed to confirm payment:', err);
      setPaymentError(err?.message || 'Failed to process payment confirmation.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {orders.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
            <div className="w-12 h-12 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center mx-auto mb-3">
              <CreditCard size={24} className="text-gray-400" />
            </div>
            <h3 className="text-base font-bold text-dark mb-1">No Pending Payments</h3>
            <p className="text-xs text-gray-500 max-w-xs mx-auto">Orders with "On Delivery" status ready for verification will appear here.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {orders.map(order => (
              <div 
                key={order.id} 
                className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-dark transition-colors cursor-pointer"
                onClick={() => setSelectedOrder(order)}
              >
                <div className="p-5">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">{order.id}</span>
                      <h3 className="text-sm font-bold text-dark">{order.customer.name}</h3>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-700 border border-gray-200">
                      {order.paymentMethod}
                    </span>
                  </div>

                  <div className="space-y-1.5 mb-4 py-3 border-y border-gray-100">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500 font-medium">Total Amount:</span>
                      <span className="font-bold text-dark">{formatPrice(order.total)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500 font-medium">Payment Status:</span>
                      <span className={`font-bold ${order.paymentStatus === 'Paid' ? 'text-green-700' : 'text-amber-700'}`}>
                        {order.paymentStatus || 'Pending'}
                      </span>
                    </div>
                  </div>

                  <button className="w-full bg-gray-50 border border-gray-200 text-dark py-2 rounded-lg text-xs font-bold hover:bg-dark hover:text-white transition-colors flex items-center justify-center gap-1.5 uppercase tracking-wider">
                    <Eye size={14} /> View Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Details Modal */}
        <AnimatePresence>
          {selectedOrder && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div 
                className="absolute inset-0 bg-black/50"
                onClick={() => setSelectedOrder(null)}
              />
              <div 
                className="relative bg-white w-full max-w-3xl max-h-[90vh] rounded-xl border border-gray-200 overflow-hidden flex flex-col z-10"
              >
                <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                  <h2 className="text-sm font-black text-dark uppercase tracking-wider">Payment Verification</h2>
                  <button onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-dark">
                    <X size={18} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Customer Info */}
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Customer Details</h3>
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                          <User size={16} className="text-gray-500" />
                          <div>
                            <p className="text-[10px] font-bold text-gray-500 uppercase">Full Name</p>
                            <p className="font-bold text-dark text-xs">{selectedOrder.customer.name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                          <Phone size={16} className="text-gray-500" />
                          <div>
                            <p className="text-[10px] font-bold text-gray-500 uppercase">Phone Number</p>
                            <p className="font-bold text-dark text-xs">{selectedOrder.customer.phone}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                          <Facebook size={16} className="text-gray-500" />
                          <div>
                            <p className="text-[10px] font-bold text-gray-500 uppercase">Facebook</p>
                            <p className="font-bold text-dark text-xs">{selectedOrder.customer.facebook}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                          <MapPin size={16} className="text-gray-500" />
                          <div>
                            <p className="text-[10px] font-bold text-gray-500 uppercase">Address & Landmark</p>
                            <p className="font-bold text-dark text-xs">{selectedOrder.customer.address}</p>
                            <p className="text-[11px] text-gray-500">Landmark: {selectedOrder.customer.landmark}</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-dark p-4 rounded-lg text-white">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-300">Order Total</span>
                          <span className="text-xl font-black text-white">{formatPrice(selectedOrder.total)}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-300">Payment Method</span>
                          <span className="font-bold">{selectedOrder.paymentMethod}</span>
                        </div>
                      </div>
                    </div>

                    {/* Payment Proof */}
                    <div>
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Payment Proof</h3>
                      {selectedOrder.paymentMethod === 'GCash' ? (
                        selectedOrder.paymentScreenshot ? (
                          <div className="rounded-lg overflow-hidden border border-gray-200 aspect-[9/16] max-h-[380px] mx-auto bg-gray-50">
                            <img src={selectedOrder.paymentScreenshot} alt="Payment Proof" className="w-full h-full object-contain" />
                          </div>
                        ) : (
                          <div className="bg-gray-50 rounded-lg p-8 text-center border border-gray-200">
                            <AlertCircle size={32} className="text-gray-400 mx-auto mb-2" />
                            <p className="text-gray-600 font-bold text-xs">No screenshot uploaded yet.</p>
                          </div>
                        )
                      ) : (
                        <div className="bg-amber-50 rounded-lg p-6 text-center border border-amber-200">
                          <CreditCard size={32} className="text-amber-700 mx-auto mb-2" />
                          <h4 className="text-sm font-bold text-amber-900 mb-1">Cash on Pickup</h4>
                          <p className="text-amber-800 text-xs">Collect {formatPrice(selectedOrder.total)} from the customer upon store pickup.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {paymentError && (
                  <div className="mx-6 mb-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                    <AlertCircle size={15} className="shrink-0" />
                    <span>{paymentError}</span>
                  </div>
                )}

                <div className="p-4 border-t border-gray-200 bg-gray-50 flex gap-2">
                  <button 
                    onClick={() => setSelectedOrder(null)}
                    disabled={isProcessingPayment}
                    className="flex-1 bg-white text-gray-700 py-2.5 rounded-lg font-bold border border-gray-300 hover:bg-gray-100 transition-colors text-xs uppercase tracking-wider disabled:opacity-50"
                  >
                    Close
                  </button>
                  <button 
                    onClick={() => handleConfirmPayment(selectedOrder.id)}
                    disabled={isProcessingPayment}
                    className="flex-1 bg-dark text-white py-2.5 rounded-lg font-bold hover:bg-primary transition-colors flex items-center justify-center gap-2 text-xs uppercase tracking-wider active:translate-y-0.5 disabled:opacity-60"
                  >
                    {isProcessingPayment ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        <span>Processing Payment...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        <span>Confirm Payment & Complete</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default CustomerPayment;
