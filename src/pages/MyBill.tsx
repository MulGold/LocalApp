import { useState, useEffect, useContext, useRef } from 'react';
import { fetchOrders, modifyOrderPayment, modifyOrderStatus } from '../api/orderService';
import { AuthContext } from '../context/AuthContext';
import { CartContext } from '../context/CartContext';
import { useConfirm } from '../context/ConfirmContext';
import { Receipt, QrCode, Upload, CheckCircle2, AlertCircle, ShoppingBag, RefreshCw, X } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { formatPrice } from '../utils/format';
import { getAggregatedOrderItems, formatQuantityValue } from '../utils/orderItemUtils';

const MyBill = () => {
  const location = useLocation();
  const newOrderFromNav = (location.state as any)?.newOrder;

  const [bills, setBills] = useState<any[]>(() => {
    return newOrderFromNav && newOrderFromNav.status === 'Pending' ? [newOrderFromNav] : [];
  });
  const [uploading, setUploading] = useState<string | null>(null);
  const [processingPaymentId, setProcessingPaymentId] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<{ [key: string]: string }>({});
  const [loadingInitial, setLoadingInitial] = useState<boolean>(!newOrderFromNav);
  const isFetchingRef = useRef(false);
  const { user } = useContext(AuthContext) as any;
  const { showNotification } = useContext(CartContext) as any;
  const confirm = useConfirm();
  const navigate = useNavigate();

  const loadBills = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      if (!user?.email) {
        setBills([]);
        return;
      }
      const allOrders = await fetchOrders({ status: 'Pending' });
      
      // Filter orders that are 'Pending' and belong to this customer
      const activeBills = allOrders.filter(order => order.status === 'Pending');
      
      setBills(activeBills);
    } catch (err) {
      console.error('Failed to load bills:', err);
    } finally {
      isFetchingRef.current = false;
      setLoadingInitial(false);
    }
  };

  useEffect(() => {
    loadBills();

    const interval = setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        loadBills();
      }
    }, 4000); // Poll for updates while visible

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadBills();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

// Helper to compress and resize receipt images using browser Canvas API
function compressReceiptImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      try {
        const MAX_DIMENSION = 1600;
        let { width, height } = img;

        if (width <= 0 || height <= 0) {
          return reject(new Error('Invalid image dimensions.'));
        }

        // Preserve aspect ratio while ensuring width and height do not exceed MAX_DIMENSION
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Failed to create canvas context for image compression.'));
        }

        // Fill white background in case source image has transparency
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Target: ~1.5 MB or less (1.5 MB binary is ~2,097,152 base64 characters)
        const MAX_DATA_URL_LENGTH = 1.5 * 1024 * 1024 * (4 / 3);

        let quality = 0.85;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);

        // Progressive quality step-down if output exceeds 1.5 MB
        while (dataUrl.length > MAX_DATA_URL_LENGTH && quality > 0.45) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        // Progressive dimensional scaling step-down if still too large
        let currentWidth = width;
        let currentHeight = height;
        while (dataUrl.length > MAX_DATA_URL_LENGTH && currentWidth > 800) {
          currentWidth = Math.round(currentWidth * 0.8);
          currentHeight = Math.round(currentHeight * 0.8);
          canvas.width = currentWidth;
          canvas.height = currentHeight;
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, currentWidth, currentHeight);
          ctx.drawImage(img, 0, 0, currentWidth, currentHeight);
          dataUrl = canvas.toDataURL('image/jpeg', 0.75);
        }

        resolve(dataUrl);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image file. Please ensure the file is a valid JPG or PNG image.'));
    };

    img.src = objectUrl;
  });
}

  const handleFileUpload = async (orderId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so selecting the same file again triggers the event
    e.target.value = '';

    const allowedMimeTypes = ['image/jpeg', 'image/png'];
    const allowedExtensions = /\.(jpe?g|png)$/i;

    const fileType = (file.type || '').toLowerCase();
    const fileName = (file.name || '').toLowerCase();

    // Reject non-image files such as .docx, PDF, txt, etc.
    if (!allowedMimeTypes.includes(fileType) || !allowedExtensions.test(fileName)) {
      setPaymentError(prev => ({
        ...prev,
        [orderId]: "Please upload a valid receipt image (JPG or PNG). Unsupported files such as .docx or PDF are not supported."
      }));
      return;
    }

    setPaymentError(prev => ({ ...prev, [orderId]: '' }));
    setUploading(orderId);

    try {
      const compressedDataUrl = await compressReceiptImage(file);
      await modifyOrderPayment(orderId, { 
        paymentScreenshot: compressedDataUrl,
        paymentStatus: 'Paid' 
      });
      await loadBills();
    } catch (err: any) {
      console.error('Failed to upload screenshot:', err);
      setPaymentError(prev => ({
        ...prev,
        [orderId]: err?.message || 'Failed to process receipt image. Please try another image.'
      }));
    } finally {
      setUploading(null);
    }
  };

  const handleConfirmOrder = async (orderId: string) => {
    if (processingPaymentId || cancellingOrderId) return; // Prevent duplicate payment/order submissions
    const currentBill = bills.find(b => b.id === orderId);
    if (currentBill?.status === 'Cancelled') {
      setPaymentError(prev => ({ ...prev, [orderId]: 'This order has been cancelled and payment cannot be confirmed.' }));
      return;
    }

    setProcessingPaymentId(orderId);
    setPaymentError(prev => ({ ...prev, [orderId]: '' }));

    try {
      await modifyOrderStatus(orderId, 'Paid');
      showNotification('Payment Successful!', 'success');
      navigate('/my-orders');
    } catch (err: any) {
      console.error('Failed to confirm order payment:', err);
      setPaymentError(prev => ({ 
        ...prev, 
        [orderId]: err?.message || 'Payment confirmation failed. Please try again.' 
      }));
    } finally {
      setProcessingPaymentId(null);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    if (cancellingOrderId || processingPaymentId) return;

    const confirmed = await confirm({
      title: 'Cancel Order?',
      message: 'Are you sure you want to cancel this order?',
      confirmText: 'Cancel Order',
      cancelText: 'Keep Order',
      variant: 'destructive'
    });
    if (!confirmed) {
      return;
    }

    setCancellingOrderId(orderId);
    setPaymentError(prev => ({ ...prev, [orderId]: '' }));

    try {
      await modifyOrderStatus(orderId, 'Cancelled');
      // Immediately remove from local state so it is no longer treated as an active unpaid bill in My Bill
      setBills(prev => prev.filter(b => b.id !== orderId));
      showNotification('Order has been cancelled.', 'info');
      await loadBills();
    } catch (err: any) {
      console.error('Failed to cancel order:', err);
      setPaymentError(prev => ({
        ...prev,
        [orderId]: err?.message || 'Failed to cancel order. Please try again.'
      }));
    } finally {
      setCancellingOrderId(null);
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-4xl py-6 sm:py-8">
      {loadingInitial && bills.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-gray-200 flex flex-col items-center justify-center">
          <RefreshCw size={28} className="animate-spin text-gray-400 mb-3" />
          <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Loading your bill...</p>
        </div>
      ) : bills.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
          <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
            <ShoppingBag size={28} className="text-gray-400" />
          </div>
          <h3 className="text-lg font-bold text-dark mb-1">No Pending Bills Found</h3>
          <p className="text-gray-500 text-xs max-w-xs mx-auto font-medium">Any new orders requiring payment will appear here.</p>
          <button 
            onClick={() => navigate('/menu')}
            className="mt-6 bg-primary text-white px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors"
          >
            Browse Menu
          </button>
        </div>
      ) : (
        <div className="grid gap-6">
          {bills.map(bill => {
            const aggregatedItems = getAggregatedOrderItems(bill.items || []);
            const remainingCount = aggregatedItems.length - 3;
            return (
              <div key={bill.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="bg-dark p-5 sm:p-6 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Order Transaction ID</p>
                    <h3 className="text-xl font-bold font-mono tracking-tight">{bill.id}</h3>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {aggregatedItems.slice(0, 3).map((item, i) => (
                        <span key={i} className="text-[11px] bg-white/10 px-2 py-0.5 rounded text-gray-200 border border-white/10">
                          {item.name} ×{formatQuantityValue(item.quantity)}
                        </span>
                      ))}
                      {remainingCount > 0 && (
                        <span className="text-[11px] bg-white/10 px-2 py-0.5 rounded text-gray-200">
                          +{remainingCount} more
                        </span>
                      )}
                    </div>
                  </div>
                <div className="sm:text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Total Due</p>
                  <h3 className="text-3xl font-black text-primary tracking-tight">{formatPrice(bill.total)}</h3>
                </div>
              </div>

              <div className="p-6 sm:p-8">
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div className="bg-blue-50/60 p-6 rounded-lg border border-blue-200 flex flex-col items-center">
                      <div className="flex items-center gap-2 mb-4 text-blue-900 w-full justify-center">
                        <QrCode size={20} />
                        <h4 className="text-sm font-bold uppercase tracking-wider">Gip's Kitchen GCash</h4>
                      </div>
                      <div className="bg-white p-4 rounded-lg mb-4 flex justify-center border border-blue-200">
                        <img 
                          src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=Gcash:09123456789" 
                          alt="GCash QR Code" 
                          className="w-48 h-48 object-contain"
                        />
                      </div>
                      <div className="text-center space-y-0.5">
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Account Name</p>
                        <p className="text-base font-black text-blue-950">GIP'S KITCHEN</p>
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider pt-2">Account Number</p>
                        <p className="text-2xl font-black text-blue-800 tracking-tight">0912 345 6789</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="bg-gray-100 p-1.5 rounded text-gray-700">
                          <Upload size={16} />
                        </div>
                        <h4 className="text-sm font-bold text-dark uppercase tracking-wider">Proof of Payment</h4>
                      </div>
                      
                      {bill.paymentScreenshot ? (
                        <div className="space-y-4">
                          <div className="relative rounded-lg overflow-hidden border border-green-300 aspect-[4/5] max-h-64 mx-auto bg-gray-50">
                            <img src={bill.paymentScreenshot} alt="Receipt" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-dark/40 flex items-center justify-center">
                              <div className="bg-white p-2 rounded-full">
                                <CheckCircle2 size={32} className="text-green-600" />
                              </div>
                            </div>
                          </div>
                          <div className="bg-green-50 p-3 rounded-lg flex items-center gap-2 text-green-800 border border-green-200 font-bold text-xs">
                            <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                            Receipt uploaded successfully! Ready to confirm.
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <p className="text-gray-600 text-xs leading-relaxed">
                            To process your order, please upload a screenshot of your GCash payment confirmation receipt.
                          </p>
                          <label className={`
                            flex flex-col items-center justify-center w-full h-52 border-2 border-dashed rounded-lg cursor-pointer transition-colors
                            ${uploading === bill.id ? 'bg-gray-50 border-gray-300' : 'bg-gray-50 border-gray-300 hover:border-dark hover:bg-gray-100/50'}
                          `}>
                            <div className="flex flex-col items-center justify-center p-5 text-center">
                              {uploading === bill.id ? (
                                <div className="space-y-2 flex flex-col items-center">
                                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-dark border-t-transparent"></div>
                                  <p className="text-xs font-bold text-gray-600">Processing screenshot...</p>
                                </div>
                              ) : (
                                <>
                                  <div className="bg-white p-2.5 rounded-lg border border-gray-200 mb-3 text-gray-500">
                                    <Upload size={24} />
                                  </div>
                                  <p className="text-dark font-bold text-sm mb-0.5">Click or drag screenshot here</p>
                                  <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">PNG, JPG, or JPEG image</p>
                                </>
                              )}
                            </div>
                            <input type="file" className="hidden" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={(e) => handleFileUpload(bill.id, e)} disabled={uploading === bill.id} />
                          </label>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-6 pt-4 border-t border-gray-100">
                      {paymentError[bill.id] && (
                        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                          <AlertCircle size={15} className="shrink-0" />
                          <span>{paymentError[bill.id]}</span>
                        </div>
                      )}
                      <button 
                        onClick={() => handleConfirmOrder(bill.id)}
                        disabled={!bill.paymentScreenshot || processingPaymentId === bill.id || cancellingOrderId === bill.id}
                        className={`
                          w-full py-3.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2
                          ${bill.paymentScreenshot && processingPaymentId !== bill.id && cancellingOrderId !== bill.id
                            ? 'bg-dark text-white hover:bg-primary active:translate-y-0.5 shadow-sm' 
                            : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'}
                          ${processingPaymentId === bill.id ? 'opacity-70 cursor-not-allowed' : ''}
                        `}
                      >
                        {processingPaymentId === bill.id ? (
                          <>
                            <RefreshCw size={16} className="animate-spin" />
                            <span>Processing Payment...</span>
                          </>
                        ) : (
                          <span>Confirm Payment</span>
                        )}
                      </button>

                      {/* Cancel Order button directly beneath Confirm Payment */}
                      <button
                        type="button"
                        onClick={() => handleCancelOrder(bill.id)}
                        disabled={cancellingOrderId === bill.id || processingPaymentId === bill.id}
                        className="w-full mt-2.5 py-3 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 bg-white text-red-600 border border-red-200 hover:bg-red-50 hover:border-red-300 active:translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {cancellingOrderId === bill.id ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            <span>Cancelling Order...</span>
                          </>
                        ) : (
                          <>
                            <X size={14} />
                            <span>Cancel Order</span>
                          </>
                        )}
                      </button>

                      <p className="text-[10px] text-gray-400 font-medium text-center mt-2">Please double-check all details before confirming</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
};

export default MyBill;
