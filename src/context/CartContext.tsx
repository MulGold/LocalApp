import { createContext, useState, useEffect, useMemo, useCallback, useContext, useRef } from 'react';
import { AuthContext } from './AuthContext';

export const CartContext = createContext<any>(null);

export const CartProvider = ({ children }: { children: React.ReactNode }) => {
  const auth = useContext(AuthContext);
  const user = auth?.user;
  const prevUserRef = useRef(user);

  const [cart, setCart] = useState(() => {
    const savedCart = localStorage.getItem('capstone_cart');
    return savedCart ? JSON.parse(savedCart) : [];
  });

  const [notification, setNotification] = useState<{ message: string; type?: string } | string | null>(null);

  const showNotification = useCallback((message: string, type: 'default' | 'success' = 'default') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    localStorage.removeItem('capstone_cart');
  }, []);

  // Synchronize cart changes to localStorage
  useEffect(() => {
    if (cart.length === 0) {
      localStorage.removeItem('capstone_cart');
    } else {
      localStorage.setItem('capstone_cart', JSON.stringify(cart));
    }
  }, [cart]);

  // Detect authenticated-user -> logged-out transition or user account switch
  useEffect(() => {
    const prevUser = prevUserRef.current;
    const wasAuthenticated = Boolean(prevUser && (prevUser.id || prevUser.email));
    const isNowLoggedOut = !user;
    const switchedUser = Boolean(
      wasAuthenticated && 
      user && 
      ((prevUser.id && user.id && prevUser.id !== user.id) || 
       (prevUser.email && user.email && prevUser.email !== user.email))
    );

    // Only clear cart when transitioning from authenticated to logged out or switching users.
    // Do NOT clear cart merely because app initially loads with no authenticated user (preserves guest cart).
    if ((wasAuthenticated && isNowLoggedOut) || switchedUser) {
      clearCart();
    }

    prevUserRef.current = user;
  }, [user, clearCart]);

  // Handle explicit auth expiration events as an additional defense-in-depth safeguard
  useEffect(() => {
    const handleAuthExpired = () => {
      clearCart();
    };
    window.addEventListener('auth:expired', handleAuthExpired);
    return () => {
      window.removeEventListener('auth:expired', handleAuthExpired);
    };
  }, [clearCart]);

  const addToCart = useCallback((product: any) => {
    setCart((prevCart: any[]) => {
      const existingItem = prevCart.find((item) => item.id === product.id);
      const currentQty = existingItem ? existingItem.quantity : 0;
      
      if (currentQty >= product.stock) {
        showNotification(`Sorry, only ${product.stock} units available.`);
        return prevCart;
      }

      if (existingItem) {
        return prevCart.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prevCart, { ...product, quantity: 1 }];
    });
    
    showNotification(`${product.name} added to cart!`);
  }, [showNotification]);

  const updateQuantity = useCallback((productId: string | number, delta: number) => {
    setCart((prevCart: any[]) => {
      const item = prevCart.find((i) => i.id === productId);
      if (!item) return prevCart;

      if (delta < 0) {
        if (item.quantity <= 1) {
          return prevCart;
        }
        const newQty = Math.max(1, item.quantity + delta);
        return prevCart.map((i) =>
          i.id === productId ? { ...i, quantity: newQty } : i
        );
      }

      if (delta > 0) {
        const newQty = item.quantity + delta;
        if (newQty > item.stock) {
          showNotification(`Maximum available quantity reached (${item.stock}).`);
          return prevCart;
        }
        return prevCart.map((i) =>
          i.id === productId ? { ...i, quantity: newQty } : i
        );
      }

      return prevCart;
    });
  }, [showNotification]);

  const removeFromCart = useCallback((productId: string | number) => {
    setCart((prevCart: any[]) => prevCart.filter((item) => item.id !== productId));
  }, []);

  const getCartTotal = useCallback(() => {
    return cart.reduce((total: number, item: any) => total + item.price * item.quantity, 0);
  }, [cart]);

  const value = useMemo(() => ({ 
    cart, 
    addToCart, 
    updateQuantity,
    removeFromCart, 
    getCartTotal, 
    clearCart, 
    notification, 
    showNotification 
  }), [cart, addToCart, updateQuantity, removeFromCart, getCartTotal, clearCart, notification, showNotification]);

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
};