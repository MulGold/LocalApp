import { useContext, useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ShoppingCart, Flame, User, LogOut, Menu as MenuIcon, X, Home, Utensils, Info, ClipboardList, Settings, CheckCircle2, TrendingUp, RefreshCw, Users, BarChart2, CreditCard, History, Receipt } from 'lucide-react';
import { IMAGES } from '../constants/images';
import { CartContext } from '../context/CartContext';
import { AuthContext } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import CartModal from './CartModal';
import { motion, AnimatePresence } from 'motion/react';

/**
 * Calculates initials based on the user's first name:
 * - When the first name consists of 1 word -> 1 letter (e.g. "Juan" -> "J", "Alex" -> "A")
 * - When the first name consists of 2 words -> 2 letters (e.g. "John Paul" -> "JP", "Mary Jane" -> "MJ", "Store Admin" -> "SA")
 * - If 3 or more words (e.g. "Juan Dela Cruz" or "John Paul Smith"):
 *   - "Juan Dela Cruz" -> First name is "Juan" (1 word) -> "J"
 *   - "John Paul Smith" -> First name is "John Paul" (2 words) -> "JP"
 *   - "Maria Clara Santos" -> First name is "Maria Clara" (2 words) -> "MC"
 */
export function getFirstNameInitials(name?: string): string {
  if (!name || typeof name !== 'string') return 'U';
  
  const trimmed = name.trim();
  if (!trimmed) return 'U';

  const cleanName = trimmed.includes('@') ? trimmed.split('@')[0] : trimmed;
  const words = cleanName.split(/\s+/).filter(Boolean);

  if (words.length === 0) return 'U';

  // 1 word -> exactly 1 letter
  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }

  // Common compound first name starters
  const TWO_WORD_FIRST_NAME_STARTERS = new Set([
    'john', 'mary', 'maria', 'juan', 'mark', 'anne', 'anna', 
    'charles', 'paul', 'jose', 'michael', 'store', 'billy', 'louie', 'carl'
  ]);

  // Common compound surname particles
  const SURNAME_PARTICLES = new Set([
    'de', 'del', 'dela', 'delos', 'san', 'santa', 'sta', 'von', 'van'
  ]);

  const firstLower = words[0].toLowerCase();
  const secondLower = words[1].toLowerCase();

  // If 3 or more words
  if (words.length >= 3) {
    if (SURNAME_PARTICLES.has(secondLower)) {
      return words[0].charAt(0).toUpperCase();
    }
    if (TWO_WORD_FIRST_NAME_STARTERS.has(firstLower)) {
      return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
    }
    return words[0].charAt(0).toUpperCase();
  }

  // Exactly 2 words: 2 letters (e.g. "Store Admin" -> "SA", "John Paul" -> "JP")
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}

const Navbar = () => {
  const { cart, notification } = useContext(CartContext) as any;
  const { user, logout } = useContext(AuthContext) as any;
  const { customerOrderUpdates, adminNewOrders, adminLowStock } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const itemCount = cart.reduce((total, item) => total + item.quantity, 0);

  // Calculate total unread notifications for the user
  const totalUnreadNotifications =
    (user?.role === 'admin' || user?.role === 'staff')
      ? (adminNewOrders + adminLowStock)
      : 0;

  // Close dropdown on click/tap outside or pressing Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsProfileDropdownOpen(false);
      }
    }

    if (isProfileDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isProfileDropdownOpen]);

  // Close dropdown when route changes
  useEffect(() => {
    setIsProfileDropdownOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentPath = location.pathname;

  const getNavSections = () => {
    if (!user) {
      return [
        {
          title: 'Main Menu',
          links: [
            { name: 'Home', path: '/', icon: <Home size={20} /> },
            { name: 'Menu', path: '/menu', icon: <Utensils size={20} /> },
            { name: 'About', path: '/about', icon: <Info size={20} /> },
          ]
        }
      ];
    }

    if (user.role === 'admin' || user.role === 'staff') {
      return [
        {
          title: 'Staff & Admin Panel',
          links: [
            { name: 'Dashboard', path: '/dashboard', icon: <TrendingUp size={20} /> },
            { name: 'Manage Orders', path: '/admin', icon: <ClipboardList size={20} />, badge: adminNewOrders },
            { name: 'POS', path: '/pos', icon: <Utensils size={20} /> },
            { name: 'Transaction History', path: '/history', icon: <History size={20} /> },
            { name: 'Manage Menu', path: '/manage-menu', icon: <Utensils size={20} /> },
            { name: 'Manage Inventory', path: '/manage-inventory', icon: <Settings size={20} />, badge: adminLowStock },
            { name: 'Reorder List', path: '/reorder-list', icon: <RefreshCw size={20} /> },
            { name: 'Sales Report', path: '/sales-report', icon: <BarChart2 size={20} /> },
          ]
        },
        {
          title: 'Account',
          links: [
            { name: 'Users Account', path: '/account-management', icon: <Users size={20} /> },
          ]
        }
      ];
    }

    if (user.role === 'customer') {
      return [
        {
          title: 'Main Menu',
          links: [
            { name: 'Dashboard', path: '/', icon: <Home size={20} /> },
            { name: 'Menu', path: '/menu', icon: <Utensils size={20} /> },
            { name: 'About', path: '/about', icon: <Info size={20} /> },
          ]
        },
        {
          title: 'My Orders',
          links: [
            { name: 'Order History', path: '/my-orders', icon: <ClipboardList size={20} /> },
            { name: 'My Bill', path: '/my-bill', icon: <Receipt size={20} /> },
          ]
        }
      ];
    }

    return [];
  };

  const navSections = getNavSections();

  // Find active link name for the header title
  const allLinks = navSections.flatMap(s => s.links);
  const activeLink = allLinks.find(l => l.path === currentPath);
  const pageTitle = activeLink ? activeLink.name : '';

  return (
    <>
      {/* Top Header (Universal) */}
      <header className="bg-white text-dark py-3 px-4 sm:px-6 border-b border-gray-200 sticky top-0 z-40 w-full">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)} 
              className="relative p-2 text-dark hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Toggle navigation menu"
            >
              <MenuIcon size={22} />
              {totalUnreadNotifications > 0 && (
                <motion.span
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[10px] font-black rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center border-2 border-white shadow-sm"
                  title={`${totalUnreadNotifications} new notifications`}
                >
                  {totalUnreadNotifications}
                </motion.span>
              )}
            </button>
            <Link to="/" className="hidden sm:flex items-center gap-2.5 text-lg font-black tracking-tight">
              <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-dark shadow-sm border border-gray-800 shrink-0">
                <img src={IMAGES.LOGO} alt="Gip's Kitchen Logo" className="w-full h-full object-cover" />
              </div>
              <span className="tracking-tight">GIP'S <span className="text-primary font-black">KITCHEN</span></span>
            </Link>
            
            {/* Page Title */}
            {pageTitle && (
              <div className="flex items-center gap-2 ml-1 sm:ml-4 border-l border-gray-200 pl-3 sm:pl-4">
                <span className="text-xs sm:text-sm font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">
                  {pageTitle}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {(user?.role === 'customer' || !user) && location.pathname !== '/login' && (
              <button 
                id="header-cart-btn"
                onClick={() => setIsCartOpen(true)} 
                className="relative p-2 text-dark hover:bg-gray-100 rounded-lg border border-transparent hover:border-gray-200 transition-colors"
                title="Your Cart"
              >
                <ShoppingCart size={20} />
                {itemCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-white text-[10px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center border border-white">
                    {itemCount}
                  </span>
                )}
              </button>
            )}

            {!user ? (
              location.pathname !== '/login' && (
                <Link 
                  id="header-signin-btn"
                  to="/login" 
                  className="bg-primary text-white hover:bg-primary/90 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors flex items-center gap-1.5 active:translate-y-0.5"
                >
                  <User size={15} />
                  <span>Sign In</span>
                </Link>
              )
            ) : (
              <div ref={profileDropdownRef} className="relative flex items-center gap-2 pl-2 border-l border-gray-200">
                <div 
                  id="header-user-avatar"
                  role="button"
                  tabIndex={0}
                  onClick={() => setIsProfileDropdownOpen(prev => !prev)}
                  onKeyDown={(e) => { 
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setIsProfileDropdownOpen(prev => !prev);
                    }
                  }}
                  title={user.name}
                  aria-label={`User profile for ${user.name}`}
                  aria-expanded={isProfileDropdownOpen}
                  aria-haspopup="true"
                  className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-black text-xs shadow-sm hover:ring-2 hover:ring-primary/40 hover:opacity-95 transition-all select-none cursor-pointer border border-primary/20 active:scale-95"
                >
                  <span className="leading-none tracking-tight">
                    {getFirstNameInitials(user.name)}
                  </span>
                </div>

                {/* Profile Dropdown Menu */}
                <AnimatePresence>
                  {isProfileDropdownOpen && (
                    <motion.div
                      id="profile-dropdown"
                      initial={{ opacity: 0, y: 6, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.96 }}
                      transition={{ duration: 0.12, ease: 'easeOut' }}
                      className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden"
                    >
                      {/* User Information */}
                      <div className="p-4 text-center">
                        {/* JR — profile initials prominently */}
                        <div 
                          id="profile-dropdown-initials"
                          className="w-12 h-12 mx-auto rounded-full bg-primary text-white flex items-center justify-center font-black text-base shadow-sm border border-primary/20 mb-2.5 select-none"
                        >
                          <span className="leading-none tracking-tight">
                            {getFirstNameInitials(user.name)}
                          </span>
                        </div>

                        {/* Full name */}
                        <h4 
                          id="profile-dropdown-name" 
                          className="font-bold text-dark text-sm leading-snug break-words"
                        >
                          {user.name}
                        </h4>

                        {/* Email address */}
                        <p 
                          id="profile-dropdown-email" 
                          className="text-xs text-gray-500 mt-0.5 break-all font-medium"
                        >
                          {user.email}
                        </p>
                      </div>

                      {/* Divider */}
                      <div className="border-t border-gray-100" />

                      {/* Logout option */}
                      <div className="p-1.5">
                        <button
                          id="profile-dropdown-logout-btn"
                          onClick={() => {
                            setIsProfileDropdownOpen(false);
                            handleLogout();
                          }}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors cursor-pointer"
                        >
                          <LogOut size={14} />
                          <span>Logout</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Notification Popup */}
      <AnimatePresence>
        {notification && (() => {
          const message = typeof notification === 'string' ? notification : notification.message;
          const isSuccess = (typeof notification === 'object' && notification?.type === 'success') || message === 'Payment Successful!';

          return (
            <motion.div
              initial={{ opacity: 0, y: -10, x: '-50%' }}
              animate={{ opacity: 1, y: 15, x: '-50%' }}
              exit={{ opacity: 0, y: -10, x: '-50%' }}
              className={`fixed top-14 left-1/2 z-50 px-5 py-2.5 rounded-lg flex items-center gap-2.5 shadow-md ${
                isSuccess 
                  ? 'bg-green-50 border border-green-200 text-green-800' 
                  : 'bg-white border border-gray-200 text-dark'
              }`}
            >
              <CheckCircle2 size={16} className={`shrink-0 ${isSuccess ? 'text-green-600' : 'text-primary'}`} />
              <span className={`text-xs font-bold ${isSuccess ? 'text-green-900' : 'text-dark'}`}>{message}</span>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-50"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full bg-white text-dark w-72 border-r border-gray-200 z-50 transition-transform duration-200 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full p-6">
          {/* Logo & Close */}
          <div className="flex justify-between items-center pb-5 border-b border-gray-200">
            <Link to="/" className="flex items-center gap-2.5 text-xl font-black tracking-tight" onClick={() => setIsSidebarOpen(false)}>
              <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center bg-dark shadow-sm border border-gray-800 shrink-0">
                <img src={IMAGES.LOGO} alt="Gip's Kitchen Logo" className="w-full h-full object-cover" />
              </div>
              <span>GIP'S <span className="text-primary">KITCHEN</span></span>
            </Link>
            <button 
              className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-dark transition-colors" 
              onClick={() => setIsSidebarOpen(false)}
              aria-label="Close navigation sidebar"
            >
              <X size={18} />
            </button>
          </div>

          {/* Navigation Sections */}
          <nav className="flex-1 py-6 space-y-6 overflow-y-auto pr-1">
            {navSections.map((section) => (
              <div key={section.title} className="space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2">{section.title}</p>
                <div className="space-y-0.5">
                  {section.links.map((link) => {
                    const isActive = currentPath === link.path;
                    return (
                      <Link 
                        key={link.name} 
                        to={link.path} 
                        className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-colors ${
                          isActive 
                            ? 'bg-primary/10 text-primary border border-primary/20' 
                            : 'text-gray-700 hover:bg-gray-100 hover:text-dark border border-transparent'
                        }`}
                        onClick={() => setIsSidebarOpen(false)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={isActive ? 'text-primary' : 'text-gray-500'}>
                            {link.icon}
                          </span>
                          <span className="truncate">{link.name}</span>
                        </div>
                        {link.badge !== undefined && link.badge > 0 && (
                          <motion.span
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                            className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-black leading-none text-white bg-red-600 rounded-full shadow-sm shrink-0"
                            title={`${link.badge} unread items`}
                          >
                            {link.badge}
                          </motion.span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      {(user?.role === 'customer' || !user) && <CartModal isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />}
    </>
  );
};

export default Navbar;