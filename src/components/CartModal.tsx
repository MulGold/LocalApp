import { useContext } from 'react';
import { CartContext } from '../context/CartContext';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { X, Trash2, ShoppingBag, Minus, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatPrice } from '../utils/format';

const CartModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const { cart, getCartTotal, removeFromCart, updateQuantity } = useContext(CartContext) as any; 
  const { user } = useContext(AuthContext) as any;
  const navigate = useNavigate();

  const handleCheckout = () => {
    if (cart.length > 0) {
      onClose();
      if (!user) {
        navigate('/login', { state: { from: { pathname: '/checkout' } } });
      } else {
        navigate('/checkout');
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50"
            onClick={onClose}
          />

          {/* Cart Drawer */}
          <motion.aside 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.2 }}
            className="fixed top-0 right-0 h-full bg-white w-full max-w-md border-l border-gray-200 z-50 flex flex-col"
          >
            <div className="p-5 flex justify-between items-center border-b border-gray-200">
              <div className="flex items-center gap-2.5">
                <div className="bg-primary/10 p-2 rounded-lg text-primary">
                  <ShoppingBag size={20} />
                </div>
                <h2 className="text-lg font-black text-dark tracking-tight">Your Cart</h2>
              </div>
              <button 
                onClick={onClose} 
                className="p-2 text-gray-400 hover:text-dark hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close cart"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-3 py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
                    <ShoppingBag size={28} />
                  </div>
                  <div>
                    <p className="text-base font-bold text-dark">Your cart is empty</p>
                    <p className="text-gray-400 text-xs mt-1">Add some delicious items from our menu!</p>
                  </div>
                  <button 
                    onClick={() => {
                      onClose();
                      navigate('/menu');
                    }}
                    className="text-xs font-bold text-primary hover:underline pt-2"
                  >
                    Continue to Menu
                  </button>
                </div>
              ) : (
                cart.map((item: any) => (
                  <div 
                    key={item.id} 
                    className="flex gap-3 items-center bg-white p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                  >
                    <div className="w-14 h-14 bg-gray-100 rounded-md overflow-hidden shrink-0 border border-gray-100">
                      <img 
                        src={item.image || '/images/image copy.png'} 
                        alt={item.name} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-dark text-xs leading-tight truncate mb-1.5">{item.name}</p>
                      <div className="flex items-center gap-1.5">
                        <button 
                          onClick={() => updateQuantity(item.id, -1)}
                          className="w-6 h-6 flex items-center justify-center rounded bg-white border border-gray-300 text-gray-600 hover:text-dark hover:border-dark transition-colors"
                          aria-label="Decrease quantity"
                        >
                          <Minus size={11} />
                        </button>
                        <span className="text-xs font-bold w-4 text-center text-dark">{item.quantity}</span>
                        <button 
                          onClick={() => updateQuantity(item.id, 1)}
                          className="w-6 h-6 flex items-center justify-center rounded bg-white border border-gray-300 text-gray-600 hover:text-dark hover:border-dark transition-colors"
                          aria-label="Increase quantity"
                        >
                          <Plus size={11} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="text-right shrink-0">
                      <p className="font-black text-primary text-xs mb-1.5">{formatPrice(item.price * item.quantity)}</p>
                      <button 
                        onClick={() => removeFromCart(item.id)} 
                        className="text-gray-400 hover:text-red-600 transition-colors p-1"
                        title="Remove item"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-5 bg-gray-50 border-t border-gray-200">
              <div className="flex justify-between items-center mb-4">
                <span className="text-gray-500 font-bold uppercase tracking-wider text-xs">Total Amount</span>
                <span className="text-2xl font-black text-dark tracking-tight">{formatPrice(getCartTotal())}</span>
              </div>
              <button
                id="cart-checkout-btn"
                onClick={handleCheckout}
                disabled={cart.length === 0}
                className="w-full bg-dark text-white py-3.5 rounded-lg hover:bg-primary disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 active:translate-y-0.5"
              >
                {!user ? 'Sign In to Checkout' : 'Proceed to Checkout'}
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

export default CartModal;