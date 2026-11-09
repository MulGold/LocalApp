import { useState, useContext } from 'react';
import { CartContext } from '../context/CartContext';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { X, Check, Package, Tag, AlertCircle, LogIn, ShoppingBag } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { formatPrice } from '../utils/format';

const ProductCard = ({ product }: { product: any }) => {
  const { addToCart, showNotification } = useContext(CartContext) as any;
  const { user } = useContext(AuthContext) as any;
  const navigate = useNavigate();
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [modalQty, setModalQty] = useState(1);
  const [addedNotice, setAddedNotice] = useState(false);

  const isManuallyUnavailable =
    product.status === 'Not Available' ||
    product.status === 'Unavailable';

  const isOutOfStock =
    !isManuallyUnavailable &&
    product.stock !== undefined &&
    product.stock <= 0;

  const isAvailable =
    !isManuallyUnavailable &&
    !isOutOfStock;

  const handleAddToCart = (qty = 1) => {
    if (!user) {
      showNotification('Please sign in or create an account to add items to your cart.');
      navigate('/login', { state: { from: { pathname: '/menu' } } });
      return;
    }
    if (isAvailable) {
      for (let i = 0; i < qty; i++) {
        addToCart(product);
      }
      setAddedNotice(true);
      setTimeout(() => setAddedNotice(false), 1800);
    }
  };

  return (
    <>
      <div className={`border border-gray-200 rounded-xl p-2.5 sm:p-3.5 bg-white flex flex-col justify-between transition-all duration-200 ${!isAvailable ? 'opacity-70 bg-gray-50' : 'hover:border-dark/60 hover:shadow-sm'}`}>
        <div>
          <div 
            className="aspect-square rounded-lg mb-2 overflow-hidden bg-gray-100 relative border border-gray-100 group cursor-pointer"
            onClick={() => setShowDetailModal(true)}
          >
            <img 
              src={product.image} 
              alt={product.name} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              referrerPolicy="no-referrer"
            />
            {!isAvailable && (
              <div className="absolute inset-0 bg-dark/70 flex items-center justify-center">
                <span className="bg-white text-dark px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-gray-300">
                  {isManuallyUnavailable ? 'Not Available' : 'Out of Stock'}
                </span>
              </div>
            )}
          </div>

          <div className="flex justify-between items-start mb-1 gap-1">
            <h3 
              onClick={() => setShowDetailModal(true)}
              className="font-bold text-dark text-xs sm:text-sm leading-tight cursor-pointer hover:text-primary transition-colors truncate"
              title={product.name}
            >
              {product.name}
            </h3>
            <span className="text-primary font-black text-xs sm:text-sm shrink-0">{formatPrice(product.price)}</span>
          </div>

          <div className="flex justify-between items-center mb-1.5 gap-1">
            <span className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">{product.category}</span>
            {isManuallyUnavailable ? (
              <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 border bg-red-50 text-red-700 border-red-200">
                Not Available
              </span>
            ) : isOutOfStock ? (
              <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 border bg-red-50 text-red-600 border-red-200">
                Out of Stock
              </span>
            ) : (
              <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 border ${
                product.stock <= 5 
                  ? 'bg-red-50 text-red-600 border-red-200' 
                  : 'bg-gray-50 text-gray-500 border-gray-200'
              }`}>
                {product.stock} left
              </span>
            )}
          </div>

          {/* Short description preview if available */}
          {product.description && (
            <p className="hidden sm:line-clamp-1 text-[11px] text-gray-500 mb-2 leading-relaxed">
              {product.description}
            </p>
          )}
        </div>
        
        {/* Action Buttons: View & Add */}
        <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-100">
          <button 
            type="button"
            id={`product-view-btn-${product.id}`}
            onClick={() => setShowDetailModal(true)}
            className="w-full py-2 rounded-lg font-bold text-xs bg-gray-50 text-dark hover:bg-gray-100 border border-gray-200 transition-colors flex items-center justify-center"
            title="View Details"
            aria-label="View Details"
          >
            View
          </button>

          {!user ? (
            <button 
              type="button"
              id={`product-signin-btn-${product.id}`}
              onClick={() => handleAddToCart(1)}
              className="w-full py-2 rounded-lg font-bold text-xs bg-dark text-white hover:bg-primary transition-colors flex items-center justify-center"
              title="Order"
              aria-label="Order"
            >
              Add
            </button>
          ) : (
            <button 
              type="button"
              id={`product-addcart-btn-${product.id}`}
              onClick={() => handleAddToCart(1)}
              disabled={!isAvailable}
              title={!isAvailable ? (isManuallyUnavailable ? 'Not Available' : 'Out of Stock') : addedNotice ? 'Added' : 'Order'}
              aria-label={!isAvailable ? (isManuallyUnavailable ? 'Not Available' : 'Out of Stock') : addedNotice ? 'Added' : 'Order'}
              className={`w-full py-2 rounded-lg font-bold text-xs transition-colors flex items-center justify-center ${
                isAvailable 
                  ? addedNotice 
                    ? 'bg-green-600 text-white border border-green-600'
                    : 'bg-dark text-white hover:bg-primary border border-transparent active:translate-y-0.5' 
                  : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
              }`}
            >
              {addedNotice ? 'Added' : 'Add'}
            </button>
          )}
        </div>
      </div>

      {/* Product Details & Description Modal */}
      <AnimatePresence>
        {showDetailModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowDetailModal(false)}
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-white w-full max-w-lg rounded-2xl border border-gray-200 shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="p-4 sm:p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/80">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-200 text-dark">
                    {product.category}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border ${
                    isAvailable 
                      ? 'bg-green-50 text-green-700 border-green-200' 
                      : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {isAvailable 
                      ? `In Stock (${product.stock})` 
                      : isManuallyUnavailable 
                        ? 'Not Available' 
                        : 'Out of Stock'}
                  </span>
                </div>

                <button 
                  id="close-product-detail-modal"
                  onClick={() => setShowDetailModal(false)}
                  className="w-8 h-8 rounded-full bg-white border border-gray-200 text-gray-500 hover:text-dark hover:bg-gray-100 flex items-center justify-center transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
                {/* Image */}
                <div className="aspect-video w-full rounded-xl overflow-hidden bg-gray-100 border border-gray-200 relative">
                  <img 
                    src={product.image} 
                    alt={product.name} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>

                {/* Title & Price */}
                <div>
                  <div className="flex justify-between items-start gap-4">
                    <h2 className="text-xl font-black text-dark tracking-tight leading-tight">
                      {product.name}
                    </h2>
                    <span className="text-2xl font-black text-primary shrink-0">
                      {formatPrice(product.price)}
                    </span>
                  </div>
                </div>

                {/* Product Description Section */}
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2">
                  <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
                    <Tag size={13} className="text-primary" /> Product Description
                  </h4>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line font-medium">
                    {product.description && product.description.trim() ? (
                      product.description
                    ) : (
                      <span className="text-gray-400 italic">
                        Delicious, freshly prepared dish crafted with premium ingredients and authentic seasonings.
                      </span>
                    )}
                  </p>
                </div>

                {/* Extra Details */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-white border border-gray-200 p-3 rounded-lg flex items-center gap-2.5">
                    <Package size={16} className="text-gray-400" />
                    <div>
                      <p className="text-[10px] uppercase font-bold text-gray-400">
                        {isManuallyUnavailable ? 'Status' : 'Available Stock'}
                      </p>
                      <p className="font-bold text-dark">
                        {isManuallyUnavailable 
                          ? 'Not Available' 
                          : isOutOfStock 
                            ? 'Out of Stock' 
                            : `${product.stock} units`}
                      </p>
                    </div>
                  </div>
                  <div className="bg-white border border-gray-200 p-3 rounded-lg flex items-center gap-2.5">
                    <Tag size={16} className="text-gray-400" />
                    <div>
                      <p className="text-[10px] uppercase font-bold text-gray-400">Menu Category</p>
                      <p className="font-bold text-dark">{product.category}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer / Add to Cart Actions */}
              <div className="p-4 sm:p-5 border-t border-gray-200 bg-gray-50 flex items-center gap-3">
                {isAvailable && (
                  <div className="flex items-center border border-gray-300 rounded-lg bg-white overflow-hidden shrink-0">
                    <button 
                      type="button"
                      onClick={() => setModalQty(Math.max(1, modalQty - 1))}
                      className="w-9 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-100 font-bold"
                    >
                      -
                    </button>
                    <span className="w-10 text-center font-bold text-sm text-dark">
                      {modalQty}
                    </span>
                    <button 
                      type="button"
                      onClick={() => setModalQty(Math.min(product.stock || 99, modalQty + 1))}
                      className="w-9 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-100 font-bold"
                    >
                      +
                    </button>
                  </div>
                )}

                <button 
                  type="button"
                  id={`modal-addcart-btn-${product.id}`}
                  onClick={() => {
                    handleAddToCart(modalQty);
                    if (user) {
                      setTimeout(() => setShowDetailModal(false), 500);
                    }
                  }}
                  disabled={!isAvailable}
                  className={`flex-1 py-3 px-4 rounded-lg font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm ${
                    !isAvailable 
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : addedNotice
                        ? 'bg-green-600 text-white'
                        : 'bg-dark text-white hover:bg-primary active:translate-y-0.5'
                  }`}
                >
                  {!user ? (
                    <>
                      <LogIn size={16} />
                      <span>Sign In to Order</span>
                    </>
                  ) : addedNotice ? (
                    <>
                      <Check size={16} />
                      <span>Added to Cart!</span>
                    </>
                  ) : (
                    <>
                      <ShoppingBag size={16} />
                      <span>
                        {isAvailable 
                          ? `Add to Cart (${formatPrice(product.price * modalQty)})` 
                          : isManuallyUnavailable 
                            ? 'Not Available' 
                            : 'Out of Stock'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ProductCard;
