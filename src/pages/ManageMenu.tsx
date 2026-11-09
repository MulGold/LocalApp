import { useState, useEffect, useMemo } from 'react';
import { fetchProducts, createProduct, editProduct, removeProduct, fetchCategories, createCategory, deleteCategory, CATEGORIES, calculateAvailableServings } from '../api/productService';
import { fetchInventory, getInventory } from '../api/inventoryService';
import { useConfirm } from '../context/ConfirmContext';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Edit2, X, Link as LinkIcon, Image as ImageIcon, Upload, Loader2, Tag, FolderPlus, FolderMinus, Search, Utensils, MoreVertical } from 'lucide-react';
import { IMAGES } from '../constants/images';
import { formatPrice } from '../utils/format';
import { CustomSelect } from '../components/CustomSelect';

const ManageMenu = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>(CATEGORIES);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const confirm = useConfirm();

  // Mobile Action Menu (⋮) state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Search & Category Filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // New Category Creation state
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryMsg, setCategoryMsg] = useState('');

  // Category Removal state
  const [isRemovingCategory, setIsRemovingCategory] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState('');
  const [isDeletingCat, setIsDeletingCat] = useState(false);

  // User-facing feedback banner state (success / error)
  const [feedbackBanner, setFeedbackBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (feedbackBanner?.type === 'success') {
      const timer = setTimeout(() => {
        setFeedbackBanner(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [feedbackBanner]);
  
  const [formData, setFormData] = useState({
    name: '',
    price: 0,
    category: 'Soups',
    image: '',
    inventoryLinkId: '',
    inventoryLinkIds: [] as string[],
    ingredients: [] as { inventoryId: string; deductionQty: number | string }[],
    stock: 0,
    status: 'Available',
    description: ''
  });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [prodsData, invData, catsData] = await Promise.all([
        fetchProducts(),
        fetchInventory(),
        fetchCategories()
      ]);
      const uniqueProds = Array.from(new Map((prodsData || []).map((item: any) => [item.id, item])).values());
      const uniqueInv = Array.from(new Map((invData || []).map((item: any) => [item.id, item])).values());
      setProducts(uniqueProds);
      setInventory(uniqueInv);
      if (Array.isArray(catsData) && catsData.length > 0) {
        setCategories(catsData);
      }
    } catch (err: any) {
      console.error('Error loading menu & inventory:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newCategoryName.trim();
    if (!cleanName) {
      setCategoryMsg('Category name cannot be empty');
      return;
    }
    try {
      await createCategory(cleanName);
      const updatedCats = await fetchCategories();
      setCategories(updatedCats);
      setFormData(prev => ({ ...prev, category: cleanName }));
      setNewCategoryName('');
      setIsAddingCategory(false);
      setCategoryMsg('');
      setFeedbackBanner({ type: 'success', message: `Category "${cleanName}" created successfully.` });
    } catch (err: any) {
      setCategoryMsg(err.message || 'Failed to create category');
    }
  };

  const handleRemoveCategory = async (catName?: string) => {
    const target = (catName || categoryToDelete || '').trim();
    if (!target) {
      setCategoryMsg('Please select a category to remove');
      return;
    }

    const itemsInCat = products.filter(p => p.category && p.category.toLowerCase() === target.toLowerCase()).length;
    const confirmMessage = itemsInCat > 0
      ? `Are you sure you want to remove the category "${target}"? ${itemsInCat} menu item(s) in this category will not be deleted and will be safely reassigned to "Uncategorized".`
      : `Are you sure you want to remove the category "${target}"?`;

    const confirmed = await confirm({
      title: 'Remove Category?',
      message: confirmMessage,
      confirmText: 'Remove Category',
      cancelText: 'Cancel',
      variant: 'warning'
    });

    if (!confirmed) {
      return;
    }

    setIsDeletingCat(true);
    setCategoryMsg('');
    try {
      await deleteCategory(target);
      const updatedCats = await fetchCategories();
      setCategories(updatedCats);
      if (selectedCategory.toLowerCase() === target.toLowerCase()) {
        setSelectedCategory('All');
      }
      if (formData.category.toLowerCase() === target.toLowerCase()) {
        setFormData(prev => ({ ...prev, category: updatedCats[0] || 'Uncategorized' }));
      }
      // Refresh products to show updated category mapping
      const prodsData = await fetchProducts();
      setProducts(Array.from(new Map((prodsData || []).map((item: any) => [item.id, item])).values()));

      setIsRemovingCategory(false);
      setCategoryToDelete('');
      setFeedbackBanner({ 
        type: 'success', 
        message: `Category "${target}" removed successfully. Associated items were safely reassigned to "Uncategorized".` 
      });
    } catch (err: any) {
      setCategoryMsg(err.message || 'Failed to remove category');
    } finally {
      setIsDeletingCat(false);
    }
  };

  const handleAdd = async () => {
    if (!formData.name.trim()) {
      setErrorMessage('Dish name is required');
      return;
    }
    if (formData.price < 0) {
      setErrorMessage('Price cannot be negative');
      return;
    }

    setErrorMessage('');
    const linkIds = Array.isArray(formData.inventoryLinkIds) && formData.inventoryLinkIds.length > 0
      ? formData.inventoryLinkIds
      : (formData.inventoryLinkId ? [formData.inventoryLinkId] : []);

    // Resolve ingredients with deductionQty for each linked item
    const resolvedIngredients = linkIds.map(id => {
      const match = (formData.ingredients || []).find((ing: any) => ing && String(ing.inventoryId) === String(id));
      const val = match ? parseFloat(String(match.deductionQty)) : 1;
      return {
        inventoryId: id,
        deductionQty: (!isNaN(val) && val > 0) ? val : 1
      };
    });

    for (const ing of resolvedIngredients) {
      if (isNaN(ing.deductionQty) || ing.deductionQty <= 0) {
        const item = inventory.find(i => i.id === ing.inventoryId);
        setErrorMessage(`Deduction quantity for "${item?.name || 'ingredient'}" must be greater than 0`);
        return;
      }
    }

    const computedStock = linkIds.length > 0
      ? calculateAvailableServings({ inventoryLinkIds: linkIds, ingredients: resolvedIngredients }, inventory)
      : (formData.stock || 0);

    const effectiveStatus = (linkIds.length > 0 && computedStock === 0) ? 'Not Available' : formData.status;

    try {
      const newProd = await createProduct({
        ...formData,
        stock: computedStock,
        status: effectiveStatus,
        inventoryLinkId: linkIds[0] || null,
        inventoryLinkIds: linkIds,
        ingredients: resolvedIngredients
      });
      let finalProd = newProd;
      if (resolvedIngredients.length > 0 && (!newProd.ingredients || newProd.ingredients.length === 0)) {
        finalProd = await editProduct(newProd.id, { ingredients: resolvedIngredients });
      }
      setProducts(prev => [...prev, finalProd]);
      resetForm();
      setIsAdding(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add product');
    }
  };

  const handleDelete = async (id: number | string) => {
    const itemToDelete = products.find(p => p.id === id || String(p.id) === String(id) || String(p._id) === String(id));
    const itemName = itemToDelete?.name ? `"${itemToDelete.name}"` : 'this menu item';

    const confirmed = await confirm({
      title: 'Delete Menu Item?',
      message: `Are you sure you want to delete ${itemName}? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive'
    });
    if (!confirmed) return;

    try {
      await removeProduct(id);
      setProducts(prev => prev.filter(p => p.id !== id && String(p.id) !== String(id) && String(p._id) !== String(id)));
      setFeedbackBanner({ type: 'success', message: `${itemName} was deleted successfully.` });
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to delete product. Please try again.';
      setFeedbackBanner({ type: 'error', message: errorMsg });
    }
  };

  const handleStartEdit = (product: any) => {
    setEditingId(product.id);
    setErrorMessage('');
    const linkIds: string[] = Array.isArray(product.inventoryLinkIds) && product.inventoryLinkIds.length > 0
      ? product.inventoryLinkIds
      : (product.inventoryLinkId ? [product.inventoryLinkId] : []);

    const existingIngredients: { inventoryId: string; deductionQty: number }[] = Array.isArray(product.ingredients)
      ? product.ingredients
      : [];

    const loadedIngredients = linkIds.map(id => {
      const match = existingIngredients.find(ing => ing && String(ing.inventoryId) === String(id));
      return {
        inventoryId: id,
        deductionQty: match && match.deductionQty !== undefined ? match.deductionQty : 1
      };
    });

    const computedStock = linkIds.length > 0
      ? calculateAvailableServings({ inventoryLinkIds: linkIds, ingredients: loadedIngredients }, inventory)
      : (product.stock || 0);

    setFormData({
      name: product.name,
      price: product.price,
      category: product.category || 'Soups',
      image: product.image,
      inventoryLinkId: linkIds[0] || '',
      inventoryLinkIds: linkIds,
      ingredients: loadedIngredients,
      stock: computedStock,
      status: (linkIds.length > 0 && computedStock === 0) ? 'Not Available' : (product.status || 'Available'),
      description: product.description || ''
    });
  };

  const handleSaveEdit = async () => {
    if (!formData.name.trim()) {
      setErrorMessage('Dish name is required');
      return;
    }
    if (formData.price < 0) {
      setErrorMessage('Price cannot be negative');
      return;
    }

    setErrorMessage('');
    const linkIds = Array.isArray(formData.inventoryLinkIds) && formData.inventoryLinkIds.length > 0
      ? formData.inventoryLinkIds
      : (formData.inventoryLinkId ? [formData.inventoryLinkId] : []);

    const resolvedIngredients = linkIds.map(id => {
      const match = (formData.ingredients || []).find((ing: any) => ing && String(ing.inventoryId) === String(id));
      const val = match ? parseFloat(String(match.deductionQty)) : 1;
      return {
        inventoryId: id,
        deductionQty: (!isNaN(val) && val > 0) ? val : 1
      };
    });

    for (const ing of resolvedIngredients) {
      if (isNaN(ing.deductionQty) || ing.deductionQty <= 0) {
        const item = inventory.find(i => i.id === ing.inventoryId);
        setErrorMessage(`Deduction quantity for "${item?.name || 'ingredient'}" must be greater than 0`);
        return;
      }
    }

    const computedStock = linkIds.length > 0
      ? calculateAvailableServings({ inventoryLinkIds: linkIds, ingredients: resolvedIngredients }, inventory)
      : (formData.stock || 0);

    const effectiveStatus = (linkIds.length > 0 && computedStock === 0) ? 'Not Available' : formData.status;

    const updated = { 
      ...formData, 
      id: editingId,
      stock: computedStock,
      status: effectiveStatus,
      inventoryLinkId: linkIds[0] || null,
      inventoryLinkIds: linkIds,
      ingredients: resolvedIngredients
    };
    try {
      const saved = await editProduct(editingId!, updated);
      setProducts(prev => prev.map(p => p.id === editingId ? saved : p));
      setEditingId(null);
      resetForm();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save product');
    }
  };

  const resetForm = () => {
    setErrorMessage('');
    setFormData({
      name: '',
      price: 0,
      category: categories[0] || 'Soups',
      image: IMAGES.PRODUCT_PLACEHOLDER,
      inventoryLinkId: '',
      inventoryLinkIds: [],
      ingredients: [],
      stock: 0,
      status: 'Available',
      description: ''
    });
  };

  const filteredProducts = useMemo(() => {
    return products.filter((p: any) => {
      const q = searchTerm.toLowerCase().trim();
      const nameMatch = p.name ? p.name.toLowerCase().includes(q) : false;
      const matchesSearch = q === '' || nameMatch;

      const matchesCat = selectedCategory === 'All' || (p.category && p.category.toLowerCase() === selectedCategory.toLowerCase());

      return matchesSearch && matchesCat;
    });
  }, [products, searchTerm, selectedCategory]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 800;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.82);
          setFormData({ ...formData, image: compressed });
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* User-friendly feedback message banner */}
        {feedbackBanner && (
          <div 
            className={`mb-5 p-4 rounded-xl border flex items-center justify-between gap-3 text-xs font-bold transition-all shadow-sm ${
              feedbackBanner.type === 'success' 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${feedbackBanner.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <span>{feedbackBanner.message}</span>
            </div>
            <button 
              type="button" 
              onClick={() => setFeedbackBanner(null)} 
              className="text-gray-400 hover:text-dark p-1 rounded-md transition-colors"
              aria-label="Dismiss message"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="hidden sm:flex flex-wrap justify-end items-center mb-6 gap-2">
          <button 
            onClick={() => { setIsAddingCategory(true); setCategoryMsg(''); }}
            className="bg-white text-dark border border-gray-300 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors"
          >
            <FolderPlus size={15} /> Add Category
          </button>
          <button 
            onClick={() => { 
              setIsRemovingCategory(true); 
              setCategoryToDelete(selectedCategory !== 'All' ? selectedCategory : (categories[0] || ''));
              setCategoryMsg(''); 
            }}
            className="bg-white text-red-600 border border-red-200 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-red-50 transition-colors"
          >
            <FolderMinus size={15} /> Remove Category
          </button>
          <button 
            onClick={() => { setIsAdding(true); resetForm(); }}
            className="bg-dark text-white px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-primary transition-colors active:translate-y-0.5"
          >
            <Plus size={16} /> Add Menu Item
          </button>
        </div>

        {/* Add Category Modal */}
        <AnimatePresence>
          {isAddingCategory && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl border border-gray-200 w-full max-w-sm overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                  <h3 className="text-sm font-black text-dark uppercase tracking-wide flex items-center gap-2">
                    <FolderPlus size={16} /> Create New Category
                  </h3>
                  <button onClick={() => setIsAddingCategory(false)} className="text-gray-400 hover:text-dark">
                    <X size={18} />
                  </button>
                </div>
                <form onSubmit={handleCreateCategory} className="p-5 space-y-4">
                  {categoryMsg && (
                    <p className="text-xs font-bold text-red-600 bg-red-50 p-2.5 rounded border border-red-200">
                      {categoryMsg}
                    </p>
                  )}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">
                      Category Name *
                    </label>
                    <input 
                      type="text" 
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="e.g. Desserts, Specials"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-dark text-xs font-semibold text-dark"
                      autoFocus
                    />
                    <p className="text-[11px] text-gray-500">This category will immediately be available for menu items and customer filters.</p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button 
                      type="button" 
                      onClick={() => setIsAddingCategory(false)}
                      className="flex-1 bg-white border border-gray-300 text-gray-700 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 bg-dark text-white py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-primary"
                    >
                      Create
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Remove Category Modal */}
        <AnimatePresence>
          {isRemovingCategory && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl border border-gray-200 w-full max-w-sm overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                  <h3 className="text-sm font-black text-red-600 uppercase tracking-wide flex items-center gap-2">
                    <FolderMinus size={16} /> Remove Menu Category
                  </h3>
                  <button onClick={() => setIsRemovingCategory(false)} className="text-gray-400 hover:text-dark">
                    <X size={18} />
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  {categoryMsg && (
                    <p className="text-xs font-bold text-red-600 bg-red-50 p-2.5 rounded border border-red-200">
                      {categoryMsg}
                    </p>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">
                      Select Category to Remove *
                    </label>
                    <CustomSelect
                      value={categoryToDelete}
                      onChange={(val) => setCategoryToDelete(val)}
                      options={[
                        { value: '', label: '-- Select a category --', disabled: true },
                        ...categories.map(cat => {
                          const count = products.filter(p => p.category && p.category.toLowerCase() === cat.toLowerCase()).length;
                          return {
                            value: cat,
                            label: `${cat} (${count} ${count === 1 ? 'item' : 'items'})`
                          };
                        })
                      ]}
                      className="w-full"
                      triggerClassName="w-full px-3 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:border-dark text-xs font-semibold text-dark bg-white cursor-pointer"
                      placeholder="-- Select a category --"
                    />
                  </div>

                  {categoryToDelete && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
                      <p className="font-bold">Important Safeguard:</p>
                      <p className="text-[11px] leading-relaxed">
                        Menu items belonging to <span className="font-bold">"{categoryToDelete}"</span> will not be deleted. They will be safely preserved and reassigned to <span className="font-bold">"Uncategorized"</span>.
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button 
                      type="button" 
                      onClick={() => setIsRemovingCategory(false)}
                      className="flex-1 bg-white border border-gray-300 text-gray-700 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleRemoveCategory(categoryToDelete)}
                      disabled={!categoryToDelete || isDeletingCat}
                      className="flex-1 bg-red-600 text-white py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      {isDeletingCat ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          <span>Removing...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 size={13} />
                          <span>Remove</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Add/Edit Form Modal-like Overlay */}
        <AnimatePresence>
          {(isAdding || editingId) && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div 
                className="bg-white rounded-xl border border-gray-200 w-full max-w-lg overflow-hidden"
              >
                <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                  <h2 className="text-base font-black text-dark uppercase tracking-wide">{editingId ? 'Edit Menu Item' : 'Add New Menu Item'}</h2>
                  <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="text-gray-400 hover:text-dark transition-colors">
                    <X size={20} />
                  </button>
                </div>
                
                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                  {errorMessage && (
                    <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-lg border border-red-200">
                      {errorMessage}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Dish Name *</label>
                      <input 
                        type="text" 
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-dark text-xs font-semibold text-dark"
                        placeholder="e.g. Chicken Inasal"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Price (₱) *</label>
                      <input 
                        type="number" 
                        min="0"
                        value={formData.price}
                        onChange={(e) => setFormData({...formData, price: parseFloat(e.target.value) || 0})}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-dark text-xs font-semibold text-dark"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Category *</label>
                      <button 
                        type="button" 
                        onClick={() => setIsAddingCategory(true)}
                        className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                      >
                        + New Category
                      </button>
                    </div>
                    <CustomSelect 
                      value={formData.category}
                      onChange={(val) => setFormData({...formData, category: val})}
                      options={categories.map(cat => ({ value: cat, label: cat }))}
                      className="w-full"
                      triggerClassName="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-dark text-xs bg-white font-semibold text-dark cursor-pointer"
                      placeholder="Select a category"
                    />
                  </div>

                  {/* Product Description Input */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1">
                      <Tag size={12} /> Product Description
                    </label>
                    <textarea 
                      rows={3}
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-dark text-xs text-dark placeholder:text-gray-400"
                      placeholder="Write details about the ingredients, recipe, flavor notes, and allergen information for customers..."
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Product Image</label>
                    <div className="flex gap-3 items-center">
                      <div className="w-16 h-16 rounded-lg bg-gray-100 overflow-hidden border border-gray-200 shrink-0">
                        <img src={formData.image || IMAGES.PRODUCT_PLACEHOLDER} alt="Preview" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="relative">
                          <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                          <input 
                            type="text" 
                            value={formData.image}
                            onChange={(e) => setFormData({...formData, image: e.target.value})}
                            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-gray-300 focus:outline-none focus:border-dark text-xs text-dark"
                            placeholder="Paste image URL..."
                          />
                        </div>
                        <label className="flex items-center justify-center gap-2 w-full py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700 hover:border-dark hover:text-dark cursor-pointer transition-colors">
                          <Upload size={13} />
                          Upload from Device
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleImageUpload} 
                            className="hidden" 
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
                        <LinkIcon size={12} className="text-gray-500" />
                        Link to Inventory Items
                      </label>
                      {formData.inventoryLinkIds.length > 0 && (
                        <button 
                          type="button" 
                          onClick={() => setFormData({...formData, inventoryLinkIds: [], inventoryLinkId: '', ingredients: [], stock: 0})}
                          className="text-[10px] font-bold text-red-600 hover:underline"
                        >
                          Clear all ({formData.inventoryLinkIds.length})
                        </button>
                      )}
                    </div>

                    {/* Scrollable multi-select checkbox list of all inventory items */}
                    <div className="border border-gray-200 rounded-lg max-h-36 overflow-y-auto divide-y divide-gray-100 bg-white">
                      {inventory.length === 0 ? (
                        <div className="p-3 text-xs text-gray-400 text-center">No inventory items available</div>
                      ) : (
                        inventory.map((item) => {
                          const isChecked = formData.inventoryLinkIds.includes(item.id);
                          return (
                            <label 
                              key={item.id}
                              className={`flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer transition-colors ${isChecked ? 'bg-green-50/60 font-semibold text-dark' : 'hover:bg-gray-50 text-gray-700'}`}
                            >
                              <div className="flex items-center gap-2">
                                <input 
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    const next = isChecked
                                      ? formData.inventoryLinkIds.filter(id => id !== item.id)
                                      : [...formData.inventoryLinkIds, item.id];
                                    const nextIngredients = isChecked
                                      ? (formData.ingredients || []).filter((ing: any) => ing && String(ing.inventoryId) !== String(item.id))
                                      : (formData.ingredients || []).some((ing: any) => ing && String(ing.inventoryId) === String(item.id))
                                        ? formData.ingredients
                                        : [...(formData.ingredients || []), { inventoryId: item.id, deductionQty: 1 }];
                                    const nextStock = next.length > 0
                                      ? calculateAvailableServings({ inventoryLinkIds: next, ingredients: nextIngredients }, inventory)
                                      : 0;
                                    setFormData({
                                      ...formData,
                                      inventoryLinkIds: next,
                                      inventoryLinkId: next[0] || '',
                                      ingredients: nextIngredients,
                                      stock: nextStock,
                                      status: (next.length > 0 && nextStock === 0) ? 'Not Available' : formData.status
                                    });
                                  }}
                                  className="rounded border-gray-300 text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                                />
                                <span>{item.name}</span>
                              </div>
                              <span className={`text-[10px] ${item.quantity <= (item.lowStockThreshold || 10) ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                                {item.quantity} {item.unit}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>

                    {/* Selected linked items with per-item deduction quantity */}
                    {formData.inventoryLinkIds.length > 0 ? (
                      <div className="p-3 bg-green-50/70 border border-green-200 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-green-800 uppercase tracking-wider">
                            Linked Ingredients ({formData.inventoryLinkIds.length}):
                          </span>
                          <span className="text-[10px] text-green-700 font-medium">
                            Deduction per serving
                          </span>
                        </div>
                        <div className="space-y-2">
                          {formData.inventoryLinkIds.map(id => {
                            const inv = inventory.find(i => i.id === id);
                            const currentIngredient = (formData.ingredients || []).find((ing: any) => ing && String(ing.inventoryId) === String(id));
                            const currentDeduction = currentIngredient?.deductionQty !== undefined ? currentIngredient.deductionQty : 1;
                            const unitLabel = inv?.unit || 'unit';

                            return (
                              <div 
                                key={id} 
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-white border border-green-200 shadow-xs"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-xs text-dark truncate">
                                    {inv ? inv.name : id}
                                  </div>
                                  <div className="text-[11px] text-gray-500 flex items-center gap-1.5 mt-0.5">
                                    <span>Unit: <span className="font-medium text-gray-800">{unitLabel}</span></span>
                                    {inv && (
                                      <>
                                        <span className="text-gray-300">•</span>
                                        <span className="text-gray-500">In stock: {inv.quantity} {unitLabel}</span>
                                      </>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <label className="text-[11px] font-medium text-gray-600 whitespace-nowrap">
                                    Deduction per serving:
                                  </label>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      step="any"
                                      min="0.0001"
                                      value={currentDeduction}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        const updatedIngs = [...(formData.ingredients || [])];
                                        const idx = updatedIngs.findIndex((ing: any) => ing && String(ing.inventoryId) === String(id));
                                        if (idx >= 0) {
                                          updatedIngs[idx] = { ...updatedIngs[idx], deductionQty: val };
                                        } else {
                                          updatedIngs.push({ inventoryId: id, deductionQty: val });
                                        }
                                        const nextStock = formData.inventoryLinkIds.length > 0
                                          ? calculateAvailableServings({ inventoryLinkIds: formData.inventoryLinkIds, ingredients: updatedIngs }, inventory)
                                          : 0;
                                        setFormData({ 
                                          ...formData, 
                                          ingredients: updatedIngs,
                                          stock: nextStock,
                                          status: (formData.inventoryLinkIds.length > 0 && nextStock === 0) ? 'Not Available' : formData.status
                                        });
                                      }}
                                      className="w-20 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-green-500 focus:border-green-500 bg-white text-dark font-medium"
                                      placeholder="1"
                                    />
                                    <span className="text-[11px] text-gray-500 font-medium min-w-7">
                                      {unitLabel}
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = formData.inventoryLinkIds.filter(i => i !== id);
                                      const nextIngredients = (formData.ingredients || []).filter((ing: any) => ing && String(ing.inventoryId) !== String(id));
                                      const nextStock = next.length > 0
                                        ? calculateAvailableServings({ inventoryLinkIds: next, ingredients: nextIngredients }, inventory)
                                        : 0;
                                      setFormData({ 
                                        ...formData, 
                                        inventoryLinkIds: next, 
                                        inventoryLinkId: next[0] || '',
                                        ingredients: nextIngredients,
                                        stock: nextStock,
                                        status: (next.length > 0 && nextStock === 0) ? 'Not Available' : formData.status
                                      });
                                    }}
                                    className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
                                    title="Remove link"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-gray-500 italic">
                        No inventory linked.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Availability Status</label>
                    <div className="flex gap-2">
                      <button 
                        type="button"
                        onClick={() => setFormData({...formData, status: 'Available'})}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${formData.status === 'Available' ? 'bg-green-50 border-green-600 text-green-700' : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'}`}
                      >
                        Available
                      </button>
                      <button 
                        type="button"
                        onClick={() => setFormData({...formData, status: 'Not Available'})}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${formData.status === 'Not Available' ? 'bg-red-50 border-red-600 text-red-700' : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'}`}
                      >
                        Not Available
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 border-t border-gray-200 flex gap-2">
                  <button 
                    type="button" 
                    onClick={() => { setIsAdding(false); setEditingId(null); }}
                    className="flex-1 bg-white border border-gray-300 text-gray-700 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="button" 
                    onClick={editingId ? handleSaveEdit : handleAdd}
                    className="flex-1 bg-dark text-white py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-primary transition-colors active:translate-y-0.5"
                  >
                    {editingId ? 'Save Changes' : 'Add to Menu'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Search & Category Filter Toolbar */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-4 justify-between">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search dishes by name..."
                className="w-full pl-10 pr-9 py-2 rounded-lg bg-gray-50 border border-gray-300 focus:outline-none focus:border-dark text-xs font-semibold text-dark placeholder:text-gray-400"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')} 
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-dark p-1"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Mobile-only Three-Vertical-Dots (⋮) Action Menu */}
            <div className="relative sm:hidden">
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(prev => !prev)}
                aria-label="Actions menu"
                className="h-[34px] w-[34px] rounded-lg bg-gray-50 border border-gray-300 text-gray-700 hover:text-dark hover:bg-gray-100 flex items-center justify-center transition-colors active:bg-gray-200 shrink-0"
              >
                <MoreVertical size={16} />
              </button>

              {isMobileMenuOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-20" 
                    onClick={() => setIsMobileMenuOpen(false)} 
                  />
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl border border-gray-200 shadow-xl py-1.5 z-30">
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        setIsAddingCategory(true);
                        setCategoryMsg('');
                      }}
                      className="w-full px-4 py-2.5 text-left text-xs font-bold text-dark hover:bg-gray-50 flex items-center gap-2.5 transition-colors"
                    >
                      <FolderPlus size={15} className="text-gray-500" />
                      <span>Add Category</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        setIsRemovingCategory(true);
                        setCategoryToDelete(selectedCategory !== 'All' ? selectedCategory : (categories[0] || ''));
                        setCategoryMsg('');
                      }}
                      className="w-full px-4 py-2.5 text-left text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors"
                    >
                      <FolderMinus size={15} className="text-red-500" />
                      <span>Remove Category</span>
                    </button>
                    <div className="my-1 border-t border-gray-100" />
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        setIsAdding(true);
                        resetForm();
                      }}
                      className="w-full px-4 py-2.5 text-left text-xs font-bold text-dark hover:bg-gray-50 flex items-center gap-2.5 transition-colors"
                    >
                      <Plus size={15} className="text-dark" />
                      <span>Add Menu Item</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <CustomSelect 
              labelPrefix="Category:"
              value={selectedCategory}
              onChange={(val) => setSelectedCategory(val)}
              options={[
                { value: 'All', label: `All Categories (${products.length})` },
                ...categories.map(cat => ({ value: cat, label: cat }))
              ]}
              triggerClassName="bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-dark hover:border-dark focus:outline-none cursor-pointer"
            />

            {selectedCategory !== 'All' && (
              <button
                type="button"
                onClick={() => handleRemoveCategory(selectedCategory)}
                title={`Remove category "${selectedCategory}"`}
                className="text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
              >
                <Trash2 size={13} />
                <span className="hidden sm:inline">Remove</span>
              </button>
            )}

            {(searchTerm || selectedCategory !== 'All') && (
              <button 
                onClick={() => { setSearchTerm(''); setSelectedCategory('All'); }}
                className="text-[11px] font-bold text-gray-500 hover:text-dark underline px-2 py-1"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-center justify-center p-12">
            <Loader2 size={28} className="animate-spin text-dark" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredProducts.length === 0 && (
          <div className="bg-white p-12 rounded-xl border border-gray-200 text-center shadow-sm">
            <Utensils className="mx-auto text-gray-300 mb-3" size={40} />
            <p className="text-sm font-bold text-dark">No menu items found</p>
            <p className="text-xs text-gray-500 mt-1">Try searching with a different term or selecting another category.</p>
            {(searchTerm || selectedCategory !== 'All') && (
              <button 
                onClick={() => { setSearchTerm(''); setSelectedCategory('All'); }}
                className="mt-4 bg-dark text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-primary transition-colors"
              >
                Clear Search Filter
              </button>
            )}
          </div>
        )}

        {/* Menu Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProducts.map((product, idx) => (
            <div key={product.id ? `menu-prod-${product.id}` : `menu-prod-idx-${idx}`} className="bg-white rounded-xl border border-gray-200 overflow-hidden group flex flex-col justify-between shadow-sm">
              <div>
                <div className="aspect-video relative overflow-hidden bg-gray-100 border-b border-gray-200">
                  <img src={product.image || IMAGES.PRODUCT_PLACEHOLDER} alt={product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  <div className="absolute top-2.5 right-2.5 flex gap-1.5">
                    <button onClick={() => handleStartEdit(product)} className="p-1.5 bg-white border border-gray-200 rounded text-gray-700 hover:text-dark hover:border-dark transition-colors shadow-sm" title="Edit">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(product.id)} className="p-1.5 bg-white border border-gray-200 rounded text-gray-700 hover:text-red-600 hover:border-red-300 transition-colors shadow-sm" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="absolute bottom-2.5 left-2.5 flex gap-1.5">
                    <span className="bg-dark text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                      {product.category}
                    </span>
                    <span className={`text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${product.status === 'Available' ? 'bg-green-700' : 'bg-red-700'}`}>
                      {product.status || 'Available'}
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-dark text-sm">{product.name}</h3>
                    <span className="text-primary font-black text-sm">{formatPrice(product.price)}</span>
                  </div>

                  {product.description && (
                    <p className="text-xs text-gray-500 line-clamp-2 mb-3 leading-relaxed">
                      {product.description}
                    </p>
                  )}

                  {(() => {
                    const linkedIds: string[] = Array.isArray(product.inventoryLinkIds) && product.inventoryLinkIds.length > 0
                      ? product.inventoryLinkIds
                      : (product.inventoryLinkId ? [product.inventoryLinkId] : []);

                    if (linkedIds.length > 0) {
                      return (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-green-700 uppercase tracking-wider bg-green-50 px-2 py-0.5 rounded border border-green-200 w-fit">
                            <LinkIcon size={11} />
                            {linkedIds.length === 1 ? (
                              <span>Linked to {inventory.find(i => i.id === linkedIds[0])?.name || 'Inventory'}</span>
                            ) : (
                              <span>Linked to {linkedIds.length} inventory items</span>
                            )}
                          </div>
                          {linkedIds.length > 1 && (
                            <div className="text-[10px] text-gray-500 font-medium truncate" title={linkedIds.map(id => inventory.find(i => i.id === id)?.name || id).join(', ')}>
                              {linkedIds.map(id => inventory.find(i => i.id === id)?.name || id).join(', ')}
                            </div>
                          )}
                          <div className="text-xs font-medium text-gray-600">
                            Available: <span className={`font-bold ${product.stock <= 5 ? 'text-red-600' : 'text-dark'}`}>{product.stock}</span> units
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="flex flex-col gap-1.5">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                          Manual Stock Control
                        </div>
                        <div className="text-xs font-medium text-gray-600">
                          Available: <span className={`font-bold ${product.stock <= 5 ? 'text-red-600' : 'text-dark'}`}>{product.stock}</span> units
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ManageMenu;
