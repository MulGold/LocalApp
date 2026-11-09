import { useState, useEffect, useContext } from 'react';
import { fetchProducts, CATEGORIES } from '../api/productService';
import { createOrder, fetchSalesSummary } from '../api/orderService';
import { CartContext } from '../context/CartContext';
import { AuthContext } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Plus, Minus, Trash2, CheckCircle2, User, CreditCard, 
  XCircle, ShoppingCart, Receipt, DollarSign, Wallet, 
  ArrowRight, FileText, BarChart3, RefreshCw
} from 'lucide-react';
import { formatPrice } from '../utils/format';

const POS = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [posCart, setPosCart] = useState<any[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'GCash' | 'Card'>('Cash');
  const [amountPaidInput, setAmountPaidInput] = useState<string>('');
  
  // Receipt Modal State
  const [completedOrder, setCompletedOrder] = useState<any | null>(null);
  
  // End of Shift Report Modal
  const [isShiftReportOpen, setIsShiftReportOpen] = useState(false);
  const [shiftReportData, setShiftReportData] = useState<any | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Custom Item Modal State
  const [isCustomItemModalOpen, setIsCustomItemModalOpen] = useState(false);
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');
  const [customItemQty, setCustomItemQty] = useState('1');

  const [isOrderPanelOpen, setIsOrderPanelOpen] = useState(false);

  const { user } = useContext(AuthContext) as any;
  const { showNotification } = useContext(CartContext) as any;

  const loadProducts = async () => {
    try {
      const data = await fetchProducts();
      setProducts(data);
    } catch (err) {
      console.error('POS failed to load products:', err);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const categories = ['All', ...CATEGORIES];

  const filteredProducts = products.filter(p => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(searchLower);
    const matchesCategory = p.category === selectedCategory || selectedCategory === 'All';
    return matchesSearch && matchesCategory;
  });

  const addToPosCart = (product: any) => {
    const existing = posCart.find(item => item.id === product.id);
    const qtyInCart = existing ? existing.quantity : 0;

    if (qtyInCart >= product.stock) {
      showNotification(`Limited quantity: only ${product.stock} left.`);
      return;
    }

    if (existing) {
      setPosCart(posCart.map(item => 
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setPosCart([...posCart, { ...product, quantity: 1 }]);
    }
    showNotification(`${product.name} added to order!`);
  };

  const removeFromPosCart = (productId: any) => {
    setPosCart(posCart.filter(item => item.id !== productId));
  };

  const handleAddCustomItem = (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = parseFloat(customItemPrice);
    if (!customItemName.trim()) {
      showNotification('Please enter an item name.');
      return;
    }
    if (isNaN(priceNum) || priceNum < 0) {
      showNotification('Please enter a valid price.');
      return;
    }
    const qtyNum = parseInt(customItemQty) || 1;
    const customItem = {
      id: `custom-${Date.now()}`,
      name: customItemName.trim(),
      price: priceNum,
      quantity: qtyNum,
      category: 'Custom',
      stock: 999
    };
    setPosCart(prev => {
      const existing = prev.find(i => i.name.toLowerCase() === customItem.name.toLowerCase() && i.price === customItem.price);
      if (existing) {
        return prev.map(i => i.id === existing.id ? { ...i, quantity: i.quantity + qtyNum } : i);
      }
      return [...prev, customItem];
    });
    showNotification(`${customItem.name} added to bill!`);
    setCustomItemName('');
    setCustomItemPrice('');
    setCustomItemQty('1');
    setIsCustomItemModalOpen(false);
  };

  const updateQuantity = (productId: any, delta: number) => {
    setPosCart(posCart.map(item => {
      if (item.id === productId) {
        if (delta < 0 && item.quantity <= 1) {
          return item;
        }

        let newQty = item.quantity + delta;
        
        if (delta > 0 && newQty > item.stock) {
          showNotification(`Maximum available quantity reached (${item.stock}).`);
          return item;
        }

        if (newQty < 1) {
          return item;
        }

        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const subtotal = posCart.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
  const total = subtotal; // Can add tax or discounts if needed

  // Payment calculations
  const parsedAmountPaid = parseFloat(amountPaidInput) || 0;
  const change = Math.max(0, parsedAmountPaid - total);
  const isAmountSufficient = paymentMethod !== 'Cash' || parsedAmountPaid >= total;

  const handleOpenPayment = () => {
    if (posCart.length === 0) return;
    setAmountPaidInput(total.toString());
    setIsPaymentModalOpen(true);
  };

  const handleConfirmOrder = async () => {
    if (posCart.length === 0 || isProcessing) return;
    setIsProcessing(true);
    
    const finalAmountPaid = paymentMethod === 'Cash' ? (parsedAmountPaid || total) : total;
    const finalChange = paymentMethod === 'Cash' ? change : 0;

    const orderData = {
      items: posCart.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        inventoryLinkId: item.inventoryLinkId || null,
        inventoryLinkIds: Array.isArray(item.inventoryLinkIds) ? item.inventoryLinkIds : (item.inventoryLinkId ? [item.inventoryLinkId] : []),
        image: item.image || '',
        category: item.category || ''
      })),
      subtotal: subtotal,
      total: total,
      amountPaid: finalAmountPaid,
      change: finalChange,
      paymentMethod: paymentMethod,
      paymentStatus: 'Paid',
      status: 'Completed',
      orderType: 'POS',
      customer: {
        name: customerName.trim() || (tableNumber ? `Table #${tableNumber}` : 'Walk-in Customer'),
        phone: customerPhone.trim() || 'N/A',
        address: tableNumber ? `Table ${tableNumber}` : 'Dine-in / Counter',
        email: 'pos@gipskitchen.com'
      },
      userEmail: user?.email || 'admin@gipskitchen.com',
      userName: user?.name || 'Staff'
    };

    try {
      const savedOrder = await createOrder(orderData);
      setCompletedOrder(savedOrder);
      setIsSuccess(true);
      setPosCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setTableNumber('');
      setIsPaymentModalOpen(false);
      setIsOrderPanelOpen(false);
      
      // Refresh products to update live stock numbers
      await loadProducts();

      setTimeout(() => setIsSuccess(false), 3500);
    } catch (err) {
      console.error('Failed to submit POS order:', err);
      alert('Failed to process order. Please check database connection.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenShiftReport = async () => {
    setLoadingReport(true);
    setIsShiftReportOpen(true);
    try {
      const data = await fetchSalesSummary('day', new Date());
      setShiftReportData(data);
    } catch (err) {
      console.error('Failed to load shift report:', err);
    } finally {
      setLoadingReport(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans relative">
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* Left Side: Product Catalog */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header Bar */}
          <div className="bg-white p-3 sm:p-4 flex flex-col sm:flex-row justify-end items-center gap-3 border-b border-gray-200">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                <input 
                  type="text" 
                  placeholder="Search item or category..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-dark bg-white text-xs font-medium text-dark"
                />
              </div>

              <button
                onClick={() => setIsCustomItemModalOpen(true)}
                className="px-3 py-2 bg-white border border-gray-300 text-dark rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-gray-50 hover:border-dark transition-colors shrink-0"
                title="Add custom item to bill"
              >
                <Plus size={14} />
                <span>Add Item</span>
              </button>

              <button
                onClick={handleOpenShiftReport}
                className="px-3 py-2 bg-dark text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-primary transition-colors shrink-0"
                title="End of Shift Sales Report"
              >
                <BarChart3 size={14} />
                <span className="hidden sm:inline">Shift Report</span>
              </button>

              <button
                onClick={loadProducts}
                className="p-2 bg-white border border-gray-200 text-gray-600 hover:text-dark rounded-lg transition-colors shrink-0"
                title="Refresh menu stock"
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="bg-gray-50 px-4 py-2.5 flex gap-1.5 overflow-x-auto border-b border-gray-200 no-scrollbar">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap border ${
                  selectedCategory === cat 
                    ? 'bg-dark text-white border-dark' 
                    : 'bg-white text-gray-600 border-gray-200 hover:border-dark hover:text-dark'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-50">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {filteredProducts.map(product => {
                const isAvailable = product.status !== 'Not Available' && (product.stock > 0);
                const inCart = posCart.find(i => i.id === product.id);

                return (
                  <div
                    key={product.id}
                    onClick={() => isAvailable && addToPosCart(product)}
                    className={`bg-white p-3 rounded-xl border border-gray-200 transition-colors flex flex-col justify-between group relative cursor-pointer select-none ${
                      !isAvailable ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:border-dark active:translate-y-0.5'
                    }`}
                  >
                    {inCart && (
                      <span className="absolute top-2 right-2 z-10 bg-dark text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                        {inCart.quantity}
                      </span>
                    )}

                    <div className="w-full aspect-square mb-2.5 overflow-hidden rounded-lg bg-gray-100 relative border border-gray-100">
                      <img 
                        src={product.image} 
                        alt={product.name} 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer" 
                      />
                      {!isAvailable && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <span className="bg-red-600 text-white text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                            Out of Stock
                          </span>
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-xs font-bold text-dark line-clamp-1 mb-1">{product.name}</p>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-primary font-black text-sm">{formatPrice(product.price)}</span>
                        <span className={`text-[10px] font-bold uppercase ${product.stock <= 5 ? 'text-red-600' : 'text-gray-400'}`}>
                          {product.stock} left
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isAvailable) addToPosCart(product);
                        }}
                        disabled={!isAvailable}
                        className={`w-full py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 uppercase tracking-wider transition-colors ${
                          isAvailable
                            ? 'bg-dark text-white hover:bg-primary active:scale-95'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                        title={isAvailable ? 'Add to bill' : 'Out of stock'}
                      >
                        <Plus size={13} />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Mobile View Cart Trigger */}
        <div className="lg:hidden fixed bottom-6 right-6 z-40">
          <button 
            onClick={() => setIsOrderPanelOpen(true)}
            className="bg-dark text-white p-3.5 rounded-full shadow-lg flex items-center gap-2 relative active:scale-95"
          >
            <ShoppingCart size={20} />
            {posCart.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center border-2 border-white">
                {posCart.reduce((sum, i) => sum + i.quantity, 0)}
              </span>
            )}
          </button>
        </div>

        {/* Right Side: POS Order Sidebar */}
        <div className={`
          fixed inset-0 lg:relative lg:inset-auto z-50 lg:z-10 w-full lg:w-[380px] bg-white flex flex-col border-l border-gray-200 transition-transform duration-200
          ${isOrderPanelOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        `}>
          <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
            <div className="flex items-center gap-2">
              <Receipt size={16} className="text-dark" />
              <h2 className="text-sm font-black text-dark uppercase tracking-wider">Active Bill</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500">
                {posCart.reduce((sum, i) => sum + i.quantity, 0)} items
              </span>
              <button onClick={() => setIsOrderPanelOpen(false)} className="lg:hidden p-1 text-gray-400 hover:text-dark">
                <XCircle size={20} />
              </button>
            </div>
          </div>

          {/* Customer / Table Inputs */}
          <div className="p-3 bg-white border-b border-gray-200 grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider block mb-1">Customer Name</label>
              <input 
                type="text"
                placeholder="Walk-in"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-300 outline-none focus:border-dark text-dark"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider block mb-1">Table # (Optional)</label>
              <input 
                type="text"
                placeholder="e.g. 05"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-300 outline-none focus:border-dark text-dark"
              />
            </div>
          </div>

          {/* Cart Item List Header */}
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Ordered Items</span>
            <button
              onClick={() => setIsCustomItemModalOpen(true)}
              className="text-[11px] font-bold text-dark hover:text-primary flex items-center gap-1 transition-colors"
              title="Add custom item"
            >
              <Plus size={12} />
              <span>Add Item</span>
            </button>
          </div>

          {/* Cart Item List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {posCart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-gray-400">
                <ShoppingCart size={28} className="text-gray-300 mb-2" />
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Order is empty</p>
                <p className="text-xs text-gray-400 mt-0.5">Click menu items to add to this order</p>
              </div>
            ) : (
              posCart.map(item => (
                <div key={item.id} className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-dark truncate">{item.name}</p>
                    <p className="text-[10px] text-primary font-bold">{formatPrice(item.price)}</p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button 
                      onClick={() => updateQuantity(item.id, -1)}
                      className="w-6 h-6 flex items-center justify-center rounded bg-white border border-gray-300 text-gray-600 hover:text-dark hover:border-dark transition-colors"
                    >
                      <Minus size={11} />
                    </button>
                    <span className="text-xs font-bold w-4 text-center text-dark">{item.quantity}</span>
                    <button 
                      onClick={() => updateQuantity(item.id, 1)}
                      className="w-6 h-6 flex items-center justify-center rounded bg-white border border-gray-300 text-gray-600 hover:text-dark hover:border-dark transition-colors"
                    >
                      <Plus size={11} />
                    </button>
                  </div>

                  <div className="text-right shrink-0 min-w-[55px]">
                    <p className="text-xs font-bold text-dark">{formatPrice(item.price * item.quantity)}</p>
                    <button 
                      onClick={() => removeFromPosCart(item.id)}
                      className="text-[10px] text-red-600 hover:underline font-medium"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Totals and Checkout */}
          <div className="p-4 bg-white border-t border-gray-200 space-y-3">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-gray-500 font-medium">
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center text-dark pt-1.5 border-t border-gray-200">
                <span className="text-xs font-bold uppercase tracking-wider">Total Due</span>
                <span className="text-xl font-black text-primary">{formatPrice(total)}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button 
                onClick={() => setPosCart([])}
                disabled={posCart.length === 0}
                className="py-2.5 bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-600 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-40"
              >
                Clear
              </button>
              <button 
                onClick={handleOpenPayment}
                disabled={posCart.length === 0}
                className="col-span-2 py-2.5 bg-dark text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-primary transition-colors flex items-center justify-center gap-1.5 active:translate-y-0.5 disabled:opacity-40"
              >
                <CreditCard size={15} />
                <span>Pay {formatPrice(total)}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      <AnimatePresence>
        {isPaymentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div
              className="bg-white w-full max-w-md rounded-xl p-6 border border-gray-200"
            >
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h3 className="text-lg font-black text-dark tracking-tight">Select Payment</h3>
                  <p className="text-xs text-gray-500">Total Payable: <strong>{formatPrice(total)}</strong></p>
                </div>
                <button onClick={() => setIsPaymentModalOpen(false)} className="p-1 text-gray-400 hover:text-dark">
                  <XCircle size={20} />
                </button>
              </div>

              {/* Payment Methods */}
              <div className="grid grid-cols-3 gap-2 mb-5">
                {[
                  { id: 'Cash', label: 'Cash', icon: DollarSign },
                  { id: 'GCash', label: 'GCash', icon: Wallet },
                  { id: 'Card', label: 'Debit/Card', icon: CreditCard }
                ].map(m => {
                  const Icon = m.icon;
                  const active = paymentMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        setPaymentMethod(m.id as any);
                        if (m.id !== 'Cash') setAmountPaidInput(total.toString());
                      }}
                      className={`p-3 rounded-lg border flex flex-col items-center gap-1 transition-colors ${
                        active 
                          ? 'border-dark bg-gray-50 text-dark font-bold' 
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <Icon size={18} className={active ? "text-primary" : ""} />
                      <span className="text-xs">{m.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Cash Tendered Calculation */}
              {paymentMethod === 'Cash' && (
                <div className="space-y-3 mb-5 bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div>
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider block mb-1">Cash Tendered (₱)</label>
                    <input 
                      type="number"
                      value={amountPaidInput}
                      onChange={(e) => setAmountPaidInput(e.target.value)}
                      placeholder="Enter amount given"
                      className="w-full px-3 py-2 bg-white text-base font-bold text-dark rounded-lg border border-gray-300 outline-none focus:border-dark"
                    />
                  </div>

                  {/* Cash Preset Shortcuts */}
                  <div className="flex flex-wrap gap-1.5">
                    {[total, 100, 200, 500, 1000].map(val => (
                      <button
                        key={val}
                        onClick={() => setAmountPaidInput(val.toString())}
                        className="px-2.5 py-1 bg-white border border-gray-300 text-gray-700 hover:border-dark hover:text-dark rounded text-xs font-bold transition-colors"
                      >
                        {val === total ? 'Exact' : formatPrice(val)}
                      </button>
                    ))}
                  </div>

                  {/* Change Computation */}
                  <div className="pt-2.5 border-t border-gray-200 flex justify-between items-center">
                    <span className="text-xs font-bold uppercase text-gray-500">Change Due:</span>
                    <span className={`text-lg font-black ${parsedAmountPaid >= total ? 'text-green-700' : 'text-red-600'}`}>
                      {formatPrice(change)}
                    </span>
                  </div>
                  {parsedAmountPaid < total && (
                    <p className="text-[11px] text-red-600 font-bold">Amount tendered is less than total bill.</p>
                  )}
                </div>
              )}

              {paymentMethod === 'GCash' && (
                <div className="mb-5 p-3.5 bg-blue-50 text-blue-800 rounded-lg border border-blue-200 text-xs font-medium flex items-center gap-3">
                  <Wallet className="shrink-0 text-blue-600" size={20} />
                  <div>
                    <p>GCash Number: <strong>0912-345-6789</strong></p>
                    <p className="text-[10px] text-blue-600 mt-0.5">Recorded automatically upon confirming.</p>
                  </div>
                </div>
              )}

              <button
                onClick={handleConfirmOrder}
                disabled={!isAmountSufficient || isProcessing}
                className="w-full py-3 bg-dark text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-primary transition-colors flex items-center justify-center gap-2 active:translate-y-0.5 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Complete Order</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Completed Order Receipt Modal */}
      <AnimatePresence>
        {completedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div
              className="bg-white w-full max-w-sm rounded-xl p-6 border border-gray-200 font-mono text-xs"
            >
              <div className="text-center pb-3 border-b border-dashed border-gray-300">
                <h2 className="text-base font-black tracking-tight text-dark font-sans">GIP'S KITCHEN</h2>
                <p className="text-[10px] text-gray-500 font-sans">Official Sales Receipt</p>
                <p className="text-[10px] text-gray-400 mt-1">Ref: {completedOrder.id}</p>
                <p className="text-[10px] text-gray-400">{new Date(completedOrder.date || completedOrder.createdAt).toLocaleString()}</p>
              </div>

              <div className="py-3 space-y-1.5 border-b border-dashed border-gray-300">
                <div className="flex justify-between font-bold text-gray-500 text-[10px] uppercase">
                  <span>Item</span>
                  <span>Total</span>
                </div>
                {completedOrder.items.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center text-dark">
                    <span>{item.quantity}x {item.name}</span>
                    <span className="font-bold">{formatPrice(item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>

              <div className="py-2.5 space-y-1 border-b border-dashed border-gray-300">
                <div className="flex justify-between font-bold text-dark">
                  <span>Grand Total:</span>
                  <span>{formatPrice(completedOrder.total)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Payment Method:</span>
                  <span>{completedOrder.paymentMethod}</span>
                </div>
                {completedOrder.amountPaid > 0 && (
                  <>
                    <div className="flex justify-between text-gray-500">
                      <span>Amount Paid:</span>
                      <span>{formatPrice(completedOrder.amountPaid)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-green-700">
                      <span>Change:</span>
                      <span>{formatPrice(completedOrder.change || 0)}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="pt-4 flex font-sans">
                <button
                  onClick={() => setCompletedOrder(null)}
                  className="w-full py-2.5 bg-dark text-white rounded-lg text-xs font-bold hover:bg-primary transition-colors active:translate-y-0.5"
                >
                  Done / Next Order
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* End-of-Shift / Daily Sales Report Drawer */}
      <AnimatePresence>
        {isShiftReportOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div
              className="bg-white w-full max-w-md rounded-xl p-6 border border-gray-200"
            >
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h3 className="text-lg font-black text-dark tracking-tight">End-of-Shift Sales</h3>
                  <p className="text-xs text-gray-500">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</p>
                </div>
                <button onClick={() => setIsShiftReportOpen(false)} className="p-1 text-gray-400 hover:text-dark">
                  <XCircle size={20} />
                </button>
              </div>

              {loadingReport ? (
                <div className="py-8 text-center text-gray-400 font-bold text-xs">
                  Loading shift report...
                </div>
              ) : shiftReportData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Total Sales Today</p>
                      <p className="text-xl font-black text-primary mt-0.5">{formatPrice(shiftReportData.totalRevenue || 0)}</p>
                    </div>
                    <div className="p-3.5 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Transactions</p>
                      <p className="text-xl font-black text-dark mt-0.5">{shiftReportData.transactionCount || 0}</p>
                    </div>
                  </div>

                  <div className="p-3.5 bg-gray-50 rounded-lg border border-gray-200 space-y-1.5">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Payment Breakdown</p>
                    {Object.entries(shiftReportData.paymentMethods || {}).map(([method, amt]: any) => (
                      <div key={method} className="flex justify-between text-xs font-bold text-dark">
                        <span>{method}</span>
                        <span>{formatPrice(amt)}</span>
                      </div>
                    ))}
                    {Object.keys(shiftReportData.paymentMethods || {}).length === 0 && (
                      <p className="text-xs text-gray-400">No completed transactions today.</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 text-center py-4">No shift data available.</p>
              )}
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Item Modal */}
      <AnimatePresence>
        {isCustomItemModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCustomItemModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 z-10"
            >
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-dark text-white flex items-center justify-center">
                    <Plus size={16} />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-dark tracking-tight">Add Custom Item</h2>
                    <p className="text-xs text-gray-500">Add an off-menu item or special charge</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsCustomItemModalOpen(false)}
                  className="p-1 rounded-full text-gray-400 hover:text-dark hover:bg-gray-100 transition-colors"
                >
                  <XCircle size={20} />
                </button>
              </div>

              <form onSubmit={handleAddCustomItem} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">
                    Item Description / Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Extra Rice, Special Side Dish, Corkage"
                    value={customItemName}
                    onChange={(e) => setCustomItemName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-dark"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">
                      Price (₱)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="0.00"
                      value={customItemPrice}
                      onChange={(e) => setCustomItemPrice(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-dark font-bold text-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={customItemQty}
                      onChange={(e) => setCustomItemQty(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-dark font-bold"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCustomItemModalOpen(false)}
                    className="flex-1 py-2.5 rounded-lg border border-gray-300 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors uppercase tracking-wider"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-lg bg-dark text-white hover:bg-primary text-xs font-bold transition-colors uppercase tracking-wider flex items-center justify-center gap-1.5"
                  >
                    <Plus size={14} />
                    <span>Add to Order</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Success Notification */}
      <AnimatePresence>
        {isSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 20, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="fixed top-0 left-1/2 z-50 bg-dark text-white px-5 py-3 rounded-lg border border-gray-700 flex items-center gap-2.5 font-bold text-xs"
          >
            <CheckCircle2 size={16} className="text-green-400" />
            <span>Order Completed & Inventory Synced!</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default POS;
