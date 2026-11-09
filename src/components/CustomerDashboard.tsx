import React, { useState, useEffect, useMemo, useRef, useContext } from 'react';
import { Link } from 'react-router-dom';
import { 
  Utensils, 
  ArrowRight, 
  Clock, 
  User as UserIcon, 
  Mail, 
  Shield, 
  Calendar, 
  ShoppingBag, 
  ShoppingCart, 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  ChefHat, 
  Bell, 
  PackageCheck,
  CheckCircle2,
  CircleDot
} from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { CartContext } from '../context/CartContext';
import { fetchOrders } from '../api/orderService';
import { fetchProducts } from '../api/productService';
import { formatPrice } from '../utils/format';
import { IMAGES } from '../constants/images';
import { formatOrderItemsSummary, calculateTotalOrderQuantity } from '../utils/orderItemUtils';

/**
 * Isolated OrderImageCycler Component
 * Cycles through distinct item images of a single active order every 1 second.
 * Uses a smooth crossfade transition.
 * Guaranteed zero timer leakage: interval only created when multiple distinct images exist,
 * and cleared immediately on component unmount.
 */
const OrderImageCycler = ({ items }: { items: any[] }) => {
  const images = useMemo(() => {
    const raw = (items || []).map((item) => item?.image).filter(Boolean);
    const unique = Array.from(new Set(raw));
    return unique.length > 0 ? unique : [IMAGES.PRODUCT_PLACEHOLDER];
  }, [items]);

  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    // Single image orders remain completely static (no timer allocated)
    if (images.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [images.length]);

  return (
    <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden bg-amber-50/70 shrink-0 border border-stone-200/80 shadow-2xs">
      {images.map((imgSrc, idx) => (
        <img
          key={`${imgSrc}-${idx}`}
          src={imgSrc}
          alt="Order product"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ease-in-out ${
            idx === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'
          }`}
          onError={(e) => {
            if (e.currentTarget.src !== window.location.origin + IMAGES.PRODUCT_PLACEHOLDER) {
              e.currentTarget.src = IMAGES.PRODUCT_PLACEHOLDER;
            }
          }}
        />
      ))}
    </div>
  );
};

/**
 * Maps existing backend status to customer-facing 4-stage progression index:
 * 0: Pending (Pending, Paid)
 * 1: Processing
 * 2: Cooking
 * 3: Ready for Pickup (Ready for Pickup, Ready to Pickup)
 */
const getStatusStepIndex = (status: string): number => {
  const norm = (status || '').toLowerCase().trim();
  if (norm === 'pending' || norm === 'paid') return 0;
  if (norm === 'processing') return 1;
  if (norm === 'cooking') return 2;
  if (norm.includes('ready')) return 3;
  return 0;
};

/**
 * Returns human-friendly customer-facing badge label and color scheme based on status
 * Self-pickup flow: Pending, Processing, Cooking, Ready for Pickup
 */
const getStatusBadgeConfig = (status: string) => {
  const norm = (status || '').toLowerCase().trim();
  if (norm.includes('ready')) {
    return {
      label: 'Ready for Pickup',
      bg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      theme: 'emerald',
      icon: Bell
    };
  }
  if (norm === 'cooking') {
    return {
      label: 'Cooking',
      bg: 'bg-orange-100 text-orange-800 border-orange-200',
      theme: 'orange',
      icon: ChefHat
    };
  }
  if (norm === 'processing') {
    return {
      label: 'Processing',
      bg: 'bg-blue-100 text-blue-800 border-blue-200',
      theme: 'blue',
      icon: Check
    };
  }
  // Pending and Paid both display as Pending
  return {
    label: 'Pending',
    bg: 'bg-amber-100 text-amber-800 border-amber-200',
    theme: 'amber',
    icon: Clock
  };
};

/**
 * Active Order Card Component with 4-stage progression tracker
 */
const ActiveOrderCard = ({ order }: { order: any }) => {
  const currentStep = getStatusStepIndex(order.status);
  const badgeConfig = getStatusBadgeConfig(order.status);

  // Determine main item names and summary
  const itemsSummary = formatOrderItemsSummary(order.items || []);
  const totalItemCount = calculateTotalOrderQuantity(order.items || []);
  const orderDisplayId = order.orderNumber ? `#${order.orderNumber}` : `#${order.id.slice(-6).toUpperCase()}`;

  const steps = [
    { label: 'Pending', stepIndex: 0 },
    { label: 'Processing', stepIndex: 1 },
    { label: 'Cooking', stepIndex: 2 },
    { label: 'Ready for Pickup', stepIndex: 3 },
  ];

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200/80 shadow-2xs hover:border-amber-200 transition-colors">
      <div className="flex gap-4 sm:gap-5 items-start">
        {/* Left: Image Cycler */}
        <OrderImageCycler items={order.items || []} />

        {/* Right: Order Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="font-extrabold text-base sm:text-lg text-dark truncate">
              Order {orderDisplayId}
            </h3>
            <span className={`px-3 py-0.5 rounded-full text-xs font-bold border shrink-0 ${badgeConfig.bg}`}>
              {badgeConfig.label}
            </span>
          </div>

          <p className="font-bold text-sm text-dark/85 truncate mb-1" title={itemsSummary}>
            {itemsSummary}
          </p>

          <p className="text-xs text-stone-500 font-medium">
            {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'} • <span className="text-dark font-bold">{formatPrice(order.total)}</span>
          </p>
        </div>
      </div>

      {/* 4-Stage Status Progression Tracker */}
      <div className="mt-5 pt-4 border-t border-stone-100">
        <div className="flex items-start w-full">
          {steps.map((step, index) => {
            const isCompleted = currentStep > step.stepIndex;
            const isCurrent = currentStep === step.stepIndex;
            const isCompletedOrCurrent = currentStep >= step.stepIndex;

            const stepThemeColor = badgeConfig.theme === 'emerald' 
              ? 'bg-emerald-500 text-white' 
              : badgeConfig.theme === 'orange' 
                ? 'bg-primary text-white' 
                : badgeConfig.theme === 'blue' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-amber-500 text-white';

            return (
              <React.Fragment key={step.label}>
                <div className="flex flex-col items-center shrink-0">
                  <div 
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                      isCompletedOrCurrent 
                        ? stepThemeColor + ' ring-4 ring-white shadow-xs' 
                        : 'bg-stone-200 text-stone-400'
                    }`}
                  >
                    {isCompleted ? (
                      <Check size={13} strokeWidth={3} />
                    ) : isCurrent ? (
                      step.stepIndex === 2 ? (
                        <ChefHat size={13} />
                      ) : step.stepIndex === 3 ? (
                        <Bell size={13} />
                      ) : (
                        <div className="w-2.5 h-2.5 rounded-full bg-white" />
                      )
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-stone-400" />
                    )}
                  </div>
                  <span className={`text-[10px] sm:text-xs font-bold mt-1.5 transition-colors text-center ${
                    isCurrent 
                      ? (badgeConfig.theme === 'emerald' ? 'text-emerald-700' : badgeConfig.theme === 'orange' ? 'text-primary' : badgeConfig.theme === 'blue' ? 'text-blue-700' : 'text-amber-700') 
                      : isCompleted ? 'text-dark' : 'text-stone-400'
                  }`}>
                    {step.label}
                  </span>
                </div>

                {/* Connector line rendered ONLY between stages (never after final step) */}
                {index < steps.length - 1 && (
                  <div className="flex-1 mt-[13px] h-0.5 bg-stone-200 mx-1 sm:mx-2 overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 ${
                        currentStep > index
                          ? (badgeConfig.theme === 'emerald' 
                              ? 'bg-emerald-500' 
                              : badgeConfig.theme === 'orange' 
                                ? 'bg-primary' 
                                : badgeConfig.theme === 'blue' 
                                  ? 'bg-blue-600' 
                                  : 'bg-amber-500')
                          : 'w-0'
                      }`}
                      style={{ width: currentStep > index ? '100%' : '0%' }}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {currentStep === 3 && (
        <div className="mt-4 p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
          <p className="text-xs font-bold text-emerald-800">
            🛍️ Your order is ready for pickup! Present your Order ID at the counter to claim.
          </p>
        </div>
      )}
    </div>
  );
};

/**
 * Customer Dashboard Main Component
 */
export const CustomerDashboard = () => {
  const { user, accounts } = useContext(AuthContext) as any;
  const { addToCart } = useContext(CartContext) as any;

  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addedItemNotice, setAddedItemNotice] = useState<string | null>(null);

  const carouselRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);

  // Find exact matching account in AuthContext.accounts for registration & last login timestamps
  const currentAccount = useMemo(() => {
    if (!accounts || !Array.isArray(accounts) || !user?.email) return null;
    return accounts.find((a: any) => a.email?.toLowerCase() === user.email.toLowerCase());
  }, [accounts, user?.email]);

  // Load customer orders and products concurrently
  useEffect(() => {
    let isMounted = true;

    // Initial load: fetches customer orders and catalog products independently
    const loadInitialData = async () => {
      if (!user?.email) {
        if (isMounted) {
          setLoading(false);
        }
        return;
      }
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      if (isMounted) {
        setLoading(true);
      }

      // Fetch products in the background independently without blocking Current Orders
      fetchProducts()
        .then((productsData) => {
          if (isMounted && Array.isArray(productsData)) {
            setCatalogProducts(productsData);
          }
        })
        .catch((err) => {
          console.error('Failed to load catalog products:', err);
        });

      try {
        const ordersData = await fetchOrders({ email: user.email });
        if (isMounted && Array.isArray(ordersData)) {
          setCustomerOrders(ordersData);
        }
      } catch (err) {
        console.error('Failed to load dashboard orders:', err);
      } finally {
        isFetchingRef.current = false;
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    // Periodic poll: polls ONLY customer orders every 5 seconds
    const pollOrders = async () => {
      if (isFetchingRef.current || !user?.email) return;
      isFetchingRef.current = true;

      try {
        const ordersData = await fetchOrders({ email: user.email });
        if (isMounted && Array.isArray(ordersData)) {
          setCustomerOrders(ordersData);
        }
      } catch (err) {
        console.error('Failed to poll customer orders:', err);
      } finally {
        isFetchingRef.current = false;
      }
    };

    loadInitialData();

    // Re-check periodically when tab is active: poll customer orders ONLY every 5 seconds
    const interval = setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        pollOrders();
      }
    }, 5000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pollOrders();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.email]);

  // Filter active customer orders (only Paid, Processing, Cooking, Ready for Pickup / Ready to Pickup)
  const activeOrders = useMemo(() => {
    const activeStatuses = ['Paid', 'Processing', 'Cooking', 'Ready for Pickup', 'Ready to Pickup'];
    return customerOrders.filter(
      (o) => activeStatuses.includes(o.status)
    );
  }, [customerOrders]);

  // Format Date Registered
  const formattedDateRegistered = useMemo(() => {
    const rawDate = currentAccount?.createdAt || user?.createdAt;
    if (!rawDate) return 'Sep 12, 2025';
    try {
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) return 'Sep 12, 2025';
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return 'Sep 12, 2025';
    }
  }, [currentAccount, user]);

  // Format Last Login
  const formattedLastLogin = useMemo(() => {
    const rawDate = currentAccount?.lastLogin || user?.lastLogin;
    if (!rawDate) return 'Just now';
    try {
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) return 'Just now';
      const datePart = d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      const timePart = d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      return `${datePart} • ${timePart}`;
    } catch {
      return 'Just now';
    }
  }, [currentAccount, user]);

  // Extract Order Again products based on customer's previous valid orders
  const orderAgainProducts = useMemo(() => {
    if (!catalogProducts || catalogProducts.length === 0 || !customerOrders || customerOrders.length === 0) {
      return [];
    }

    // Include only statuses that represent valid paid purchases.
    // Exclude Cancelled, Pending (unpaid in Gips Kitchen), and any orders explicitly marked as Unpaid, Cancelled, or Refunded.
    const VALID_PAID_STATUSES = new Set([
      'Paid',
      'Processing',
      'Cooking',
      'Ready for Pickup',
      'Ready to Pickup',
      'On Delivery',
      'Completed'
    ]);

    const validOrders = customerOrders.filter((order) => {
      if (!order || !order.status) return false;
      if (order.status === 'Cancelled' || order.status === 'Pending') return false;
      if (
        order.paymentStatus &&
        (order.paymentStatus === 'Unpaid' || order.paymentStatus === 'Cancelled' || order.paymentStatus === 'Refunded')
      ) {
        return false;
      }
      return VALID_PAID_STATUSES.has(order.status);
    });

    if (validOrders.length === 0) return [];

    const orderedProductIds: (string | number)[] = [];
    const seenIds = new Set<string>();

    // Scan customer orders in order of recency
    for (const order of validOrders) {
      if (!order.items || !Array.isArray(order.items)) continue;
      for (const item of order.items) {
        const idKey = String(item.id || item.productId || '');
        if (idKey && !seenIds.has(idKey)) {
          seenIds.add(idKey);
          orderedProductIds.push(item.id || item.productId);
        }
      }
    }

    if (orderedProductIds.length === 0) return [];

    // Match strictly to current live catalog; NEVER backfill from general menu
    const matchedFromOrders = orderedProductIds
      .map((id) => catalogProducts.find((p: any) => String(p.id) === String(id)))
      .filter(Boolean);

    return matchedFromOrders.slice(0, 10);
  }, [customerOrders, catalogProducts]);

  // Carousel scroll controls
  const handleScrollLeft = () => {
    if (carouselRef.current) {
      carouselRef.current.scrollBy({ left: -260, behavior: 'smooth' });
    }
  };

  const handleScrollRight = () => {
    if (carouselRef.current) {
      carouselRef.current.scrollBy({ left: 260, behavior: 'smooth' });
    }
  };

  // Add to cart handler with visual notice
  const handleAddToCart = (product: any) => {
    addToCart(product);
    setAddedItemNotice(String(product.id));
    setTimeout(() => {
      setAddedItemNotice(null);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-stone-50/60 pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8">
        
        {/* ======================================================== */}
        {/* 1. WELCOME BANNER                                        */}
        {/* ======================================================== */}
        <section className="relative rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm mb-8 bg-gradient-to-r from-stone-950 via-stone-900 to-amber-950 text-white min-h-[190px] sm:min-h-[220px] flex items-center">
          <div className="absolute inset-0 z-0">
            <img 
              src={IMAGES.HERO_BG}
              alt="Gip's Kitchen Chicken Inasal"
              className="w-full h-full object-cover object-right opacity-50 sm:opacity-60"
              onError={(e) => {
                if (e.currentTarget.src !== window.location.origin + IMAGES.INASAL_HERO) {
                  e.currentTarget.src = IMAGES.INASAL_HERO;
                }
              }}
            />
            {/* Soft gradient mask for clean text readability */}
            <div className="absolute inset-0 bg-gradient-to-r from-stone-950 via-stone-950/85 to-transparent" />
          </div>

          <div className="relative z-10 p-6 sm:p-10 max-w-xl">
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-2 leading-tight">
              {user?.isFirstLogin ? 'Welcome,' : 'Welcome back,'} <br className="hidden sm:inline" />
              <span className="text-amber-400">{user?.name || 'Valued Customer'}!</span>
            </h1>
            <p className="text-stone-200 text-sm sm:text-base font-medium mb-5">
              Ready to order your favorite meals?
            </p>
            <Link 
              to="/menu"
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold text-sm px-6 py-2.5 rounded-full shadow-md transition-all active:scale-95 group"
            >
              <Utensils size={16} className="group-hover:rotate-12 transition-transform" />
              <span>Order Now</span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </section>

        {/* ======================================================== */}
        {/* 2 & 3. CURRENT ORDERS (LEFT) + ACCOUNT SUMMARY (RIGHT)    */}
        {/* ======================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 mb-10 items-start">
          
          {/* LEFT: Current Orders (approx 65% width) */}
          <div className="lg:col-span-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl sm:text-2xl font-black text-dark tracking-tight">
                Current Orders
              </h2>
            </div>

            {loading ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-stone-200/80 shadow-2xs">
                <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-stone-500 font-medium">Checking active orders...</p>
              </div>
            ) : activeOrders.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 sm:p-12 text-center border border-stone-200/80 shadow-2xs flex flex-col items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
                  <Clock size={26} />
                </div>
                <h3 className="text-base font-bold text-dark mb-1">No Active Orders</h3>
                <p className="text-stone-500 text-xs sm:text-sm max-w-xs mb-4">
                  You don't have any orders in progress right now.
                </p>
                <Link
                  to="/menu"
                  className="inline-flex items-center gap-2 bg-primary text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors shadow-2xs"
                >
                  <Utensils size={14} />
                  <span>Order Now</span>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {activeOrders.map((order) => (
                  <ActiveOrderCard key={order.id} order={order} />
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: Account Summary (approx 35% width) */}
          <div className="lg:col-span-4">
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-stone-200/80 shadow-2xs">
              {/* Header */}
              <div className="flex items-center gap-3 pb-5 mb-5 border-b border-stone-100">
                <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <UserIcon size={20} />
                </div>
                <h3 className="font-bold text-dark text-lg tracking-tight">
                  Account Summary
                </h3>
              </div>

              {/* Data Rows */}
              <div className="space-y-3.5 text-xs sm:text-sm">
                
                {/* Full Name */}
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-stone-500 font-medium">
                    <UserIcon size={15} className="text-stone-400 shrink-0" />
                    <span>Full Name</span>
                  </span>
                  <span className="font-bold text-dark truncate text-right">
                    {user?.name || 'Customer'}
                  </span>
                </div>

                {/* Email */}
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-stone-500 font-medium">
                    <Mail size={15} className="text-stone-400 shrink-0" />
                    <span>Email</span>
                  </span>
                  <span className="font-medium text-dark truncate max-w-[170px] sm:max-w-[190px] text-right" title={user?.email}>
                    {user?.email}
                  </span>
                </div>

                {/* Role */}
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-stone-500 font-medium">
                    <Shield size={15} className="text-stone-400 shrink-0" />
                    <span>Role</span>
                  </span>
                  <span className="font-semibold text-dark capitalize">
                    {user?.role || 'Customer'}
                  </span>
                </div>

                {/* Status */}
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-stone-500 font-medium">
                    <CircleDot size={15} className="text-stone-400 shrink-0" />
                    <span>Status</span>
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    {user?.status || 'Active'}
                  </span>
                </div>

                {/* Date Registered */}
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-stone-500 font-medium">
                    <Calendar size={15} className="text-stone-400 shrink-0" />
                    <span>Date Registered</span>
                  </span>
                  <span className="font-medium text-dark text-right">
                    {formattedDateRegistered}
                  </span>
                </div>

                {/* Last Login */}
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-stone-500 font-medium">
                    <Clock size={15} className="text-stone-400 shrink-0" />
                    <span>Last Login</span>
                  </span>
                  <span className="font-medium text-dark text-right text-[11px] sm:text-xs">
                    {formattedLastLogin}
                  </span>
                </div>

                {/* Number of Orders */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100">
                  <span className="flex items-center gap-2 text-stone-500 font-medium">
                    <ShoppingBag size={15} className="text-stone-400 shrink-0" />
                    <span>Number of Orders</span>
                  </span>
                  <span className="font-extrabold text-base text-dark">
                    {customerOrders.length}
                  </span>
                </div>

              </div>
            </div>
          </div>

        </div>

        {/* ======================================================== */}
        {/* 4. ORDER AGAIN (FULL-WIDTH BELOW)                        */}
        {/* ======================================================== */}
        <section className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-7 border border-stone-200/80 shadow-2xs">
          {/* Header Row */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-dark tracking-tight">
                Order Again
              </h2>
              <p className="text-xs sm:text-sm text-stone-500 font-medium">
                Based on your recent orders
              </p>
            </div>

            {/* Carousel Navigation Arrows */}
            {orderAgainProducts.length > 0 && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleScrollLeft}
                  aria-label="Scroll left"
                  className="w-8 h-8 rounded-full bg-amber-100/80 hover:bg-amber-200 text-amber-900 flex items-center justify-center transition-colors shadow-2xs active:scale-95"
                >
                  <ChevronLeft size={18} />
                </button>
                <button 
                  onClick={handleScrollRight}
                  aria-label="Scroll right"
                  className="w-8 h-8 rounded-full bg-amber-100/80 hover:bg-amber-200 text-amber-900 flex items-center justify-center transition-colors shadow-2xs active:scale-95"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>

          {orderAgainProducts.length === 0 ? (
            <div className="py-10 px-4 text-center flex flex-col items-center justify-center bg-stone-50/60 rounded-xl sm:rounded-2xl border border-dashed border-stone-200">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-amber-100/70 text-amber-800 flex items-center justify-center mb-3">
                <ShoppingBag className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-dark mb-1">
                No previous orders yet
              </h3>
              <p className="text-xs sm:text-sm text-stone-500 max-w-sm mb-5">
                Dishes you order will appear here for fast reordering.
              </p>
              <Link
                to="/menu"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs sm:text-sm transition-all shadow-xs active:scale-95"
              >
                <Utensils size={16} />
                <span>Browse Menu</span>
              </Link>
            </div>
          ) : (
            /* Horizontally scrollable carousel */
            <div 
              ref={carouselRef}
              className="flex gap-4 sm:gap-5 overflow-x-auto pb-2 scroll-smooth no-scrollbar"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {orderAgainProducts.map((product) => {
                const isUnavailable = product.status === 'Unavailable' || product.status === 'Not Available';
                const isOutOfStock = !isUnavailable && product.stock !== undefined && product.stock <= 0;
                const canOrder = !isUnavailable && !isOutOfStock;
                const isRecentlyAdded = addedItemNotice === String(product.id);

                return (
                  <div 
                    key={product.id}
                    className="w-48 sm:w-56 shrink-0 bg-white rounded-xl border border-stone-200/80 shadow-2xs overflow-hidden flex flex-col hover:border-amber-300 hover:shadow-xs transition-all"
                  >
                    {/* Product Image */}
                    <div className="h-32 sm:h-36 w-full bg-amber-50/60 overflow-hidden relative border-b border-stone-100">
                      <img 
                        src={product.image || IMAGES.PRODUCT_PLACEHOLDER}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          if (e.currentTarget.src !== window.location.origin + IMAGES.PRODUCT_PLACEHOLDER) {
                            e.currentTarget.src = IMAGES.PRODUCT_PLACEHOLDER;
                          }
                        }}
                      />
                      {!canOrder && (
                        <div className="absolute inset-0 bg-stone-900/60 flex items-center justify-center">
                          <span className="bg-white/95 text-dark font-extrabold text-[10px] px-2 py-0.5 rounded uppercase tracking-wider">
                            Out of Stock
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Product Name & Price */}
                    <div className="p-3.5 flex-1 flex flex-col justify-between">
                      <div>
                        <h4 className="font-bold text-xs sm:text-sm text-dark truncate mb-1" title={product.name}>
                          {product.name}
                        </h4>
                        <p className="font-extrabold text-xs sm:text-sm text-primary mb-3">
                          {formatPrice(product.price)}
                        </p>
                      </div>

                      {/* Add to Cart Button */}
                      <button 
                        onClick={() => handleAddToCart(product)}
                        disabled={!canOrder}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs ${
                          !canOrder
                            ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                            : isRecentlyAdded
                              ? 'bg-emerald-600 text-white'
                              : 'bg-primary hover:bg-primary/90 text-white active:scale-95'
                        }`}
                      >
                        {isRecentlyAdded ? (
                          <>
                            <Check size={14} strokeWidth={2.5} />
                            <span>Added!</span>
                          </>
                        ) : (
                          <>
                            <ShoppingCart size={14} />
                            <span>Add to Cart</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  );
};

export default CustomerDashboard;
