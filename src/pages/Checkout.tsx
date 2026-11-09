import { useContext, useState, useEffect } from 'react';
import { CartContext } from '../context/CartContext';
import { createOrder } from '../api/orderService';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { RefreshCw } from 'lucide-react';
import { formatPrice } from '../utils/format';

// Full Name Validator:
// - Required, max 50 characters
// - Rejects numbers
// - Rejects names made entirely of symbols
// - Allows valid names containing letters, spaces, hyphens, and apostrophes
export const validateFullName = (name: unknown): { isValid: boolean; error?: string } => {
  if (typeof name !== 'string') {
    return { isValid: false, error: 'Full Name is required.' };
  }
  const cleanName = name.trim();
  if (!cleanName) {
    return { isValid: false, error: 'Full Name is required.' };
  }
  if (cleanName.length > 50) {
    return { isValid: false, error: 'Full Name cannot exceed 50 characters.' };
  }
  if (/[0-9]/.test(cleanName)) {
    return { isValid: false, error: 'Full Name must not contain numbers.' };
  }
  if (!/[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/.test(cleanName)) {
    return { isValid: false, error: 'Full Name cannot be made entirely of symbols.' };
  }
  if (!/^[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF\s'-]+$/.test(cleanName)) {
    return { isValid: false, error: 'Full Name can only contain letters, spaces, hyphens, and apostrophes.' };
  }
  return { isValid: true };
};

const Checkout = () => {
  const { cart, getCartTotal, clearCart } = useContext(CartContext) as any;
  const { user } = useContext(AuthContext) as any;
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ 
    name: user?.name ? String(user.name).slice(0, 50) : '', 
    phone: '',
    paymentMethod: 'GCash'
  });
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user?.name && !formData.name) {
      setFormData(prev => ({ 
        ...prev, 
        name: String(user.name).slice(0, 50) 
      }));
    }
  }, [user]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, name: e.target.value.slice(0, 50) }));
    if (formError) setFormError('');
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Digits 0–9 only. Max 11 digits while typing or pasting.
    const filteredPhone = e.target.value.replace(/\D/g, '').slice(0, 11);
    setFormData(prev => ({ ...prev, phone: filteredPhone }));
    if (formError) setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (cart.length === 0) return alert("Your cart is empty!");
    if (isSubmitting) return;

    const nameValidation = validateFullName(formData.name);
    if (!nameValidation.isValid) {
      setFormError(nameValidation.error || 'Invalid Full Name.');
      return;
    }
    const cleanName = formData.name.trim();

    const cleanPhone = formData.phone.trim();
    if (!cleanPhone) {
      setFormError('Phone number is required.');
      return;
    }
    if (!/^\d{11}$/.test(cleanPhone)) {
      setFormError('Phone number must contain exactly 11 digits.');
      return;
    }
    if (!cleanPhone.startsWith('09')) {
      setFormError('Phone number must be a valid Philippine mobile number starting with 09 (e.g. 09123456789).');
      return;
    }

    setIsSubmitting(true);
    try {
      const customerEmail = user?.email?.trim() || '';

      const orderDetails = {
        customer: {
          name: cleanName,
          phone: cleanPhone,
          email: customerEmail,
          paymentMethod: formData.paymentMethod
        },
        userEmail: customerEmail,
        userName: cleanName,
        items: [...cart],
        total: getCartTotal(),
        date: new Date().toISOString(),
        paymentMethod: formData.paymentMethod,
        status: 'Pending',
        paymentStatus: 'Unpaid',
        orderType: 'Online'
      };

      const savedOrder = await createOrder(orderDetails); 

      clearCart(); 
      setFormData({ 
        name: '', 
        phone: '',
        paymentMethod: 'GCash'
      });
      navigate('/my-bill', { state: { newOrder: savedOrder } }); 
    } catch (err: any) {
      console.error('Checkout error:', err);
      setFormError(err?.message || 'Failed to place order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-xl py-6 sm:py-8">
      <div className="bg-white p-6 rounded-xl border border-gray-200 mb-6">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
          Order Summary
        </h2>
        <div className="space-y-3 divide-y divide-gray-100">
          {cart.map((item: any, index: number) => (
            <div key={index} className="flex justify-between items-center text-dark pt-2 first:pt-0">
              <div className="flex flex-col">
                <span className="font-bold text-sm">{item.name}</span>
                <span className="text-xs text-gray-500 font-medium">Qty: {item.quantity} × {formatPrice(item.price)}</span>
              </div>
              <span className="font-black text-primary text-sm">{formatPrice(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-200 mt-5 pt-4 flex justify-between items-center">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Total Amount</span>
          <span className="text-2xl font-black text-dark tracking-tight">{formatPrice(getCartTotal())}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-gray-200 space-y-5">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider pb-2 border-b border-gray-100">
          Pickup Customer Details
        </h2>
        
        {formError && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium">
            {formError}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Full Name</label>
            <input 
              type="text" 
              name="name" 
              value={formData.name}
              placeholder="Enter your full name"
              maxLength={50}
              required 
              onChange={handleNameChange} 
              className="w-full bg-white border border-gray-300 px-4 py-2.5 rounded-lg focus:outline-none focus:border-dark transition-colors font-medium text-sm text-dark placeholder:text-gray-400" 
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Phone Number</label>
            <input 
              type="tel" 
              name="phone" 
              value={formData.phone}
              placeholder="e.g. 09123456789"
              maxLength={11}
              pattern="09[0-9]{9}"
              required 
              onChange={handlePhoneChange} 
              className="w-full bg-white border border-gray-300 px-4 py-2.5 rounded-lg focus:outline-none focus:border-dark transition-colors font-medium text-sm text-dark placeholder:text-gray-400" 
            />
          </div>
        </div>

        <div className="pt-3">
          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full bg-dark text-white py-3.5 rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-primary transition-colors flex items-center justify-center gap-2 active:translate-y-0.5 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                <span>Placing Order...</span>
              </>
            ) : (
              <span>Confirm & Place Order</span>
            )}
          </button>
          <p className="text-[11px] text-gray-500 font-medium text-center mt-3">Pay first via GCash in My Bill to confirm your order</p>
        </div>
      </form>
    </div>
  );
};

export default Checkout;