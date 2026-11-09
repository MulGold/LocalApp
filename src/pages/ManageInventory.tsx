import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  fetchInventory, 
  createInventoryItem, 
  updateInventoryItem, 
  deleteInventoryItem, 
  adjustInventoryStock,
  fetchInventoryLogs 
} from '../api/inventoryService';
import { useNotifications } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';
import { motion, AnimatePresence } from 'motion/react';
import { CustomSelect } from '../components/CustomSelect';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  X, 
  Package, 
  AlertCircle, 
  TrendingUp, 
  TrendingDown, 
  History, 
  Search, 
  Loader2,
  SlidersHorizontal,
  ArrowUpRight,
  ArrowDownRight,
  ArrowUpDown
} from 'lucide-react';

// Helper to parse and normalize decimal numbers without floating-point artifacts or unwanted trailing zeros
const normalizeQuantity = (val: string | number | undefined | null, fallback = 0): number => {
  if (val === undefined || val === null || val === '') return fallback;
  const num = typeof val === 'number' ? val : parseFloat(String(val).trim());
  if (isNaN(num)) return fallback;
  // Round to 6 decimal places to clean up any JS binary floating-point drift, then convert back to standard number
  return Number(num.toFixed(6));
};

// Formats a number or string for display, trimming trailing zeros (e.g. 20.500 -> "20.5", 20.000 -> "20")
const formatDisplayQuantity = (val: string | number | undefined | null): string => {
  if (val === undefined || val === null || val === '') return '0';
  const num = typeof val === 'number' ? val : parseFloat(String(val).trim());
  if (isNaN(num)) return String(val);
  return String(Number(num.toFixed(6)));
};

const ManageInventory = () => {
  const [inventory, setInventory] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<'inventory' | 'logs'>('inventory');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [quantitySort, setQuantitySort] = useState<'high-to-low' | 'low-to-high'>('high-to-low');

  // Creation / Edit states (using string | number so users can type decimals naturally without premature truncation)
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState<{
    name: string;
    quantity: string | number;
    unit: string;
    stableQuantity: string | number;
    lowStockThreshold: string | number;
  }>({ name: '', quantity: '0', unit: 'pcs', stableQuantity: '0', lowStockThreshold: '10' });

  const [editItem, setEditItem] = useState<{
    name: string;
    quantity: string | number;
    unit: string;
    stableQuantity: string | number;
    lowStockThreshold: string | number;
  }>({ name: '', quantity: '0', unit: 'pcs', stableQuantity: '0', lowStockThreshold: '10' });

  // Quick Stock Adjustment Modal state
  const [adjustingItem, setAdjustingItem] = useState<any | null>(null);
  const [adjustType, setAdjustType] = useState<'stock-in' | 'stock-out' | 'manual-adjustment'>('stock-in');
  const [adjustAmount, setAdjustAmount] = useState<string | number>('1');
  const [adjustReason, setAdjustReason] = useState<string>('');

  const UNIT_OPTIONS = ['pcs', 'kg', 'pack', 'bottle', 'can', 'box', 'liter', 'ml', 'g'];
  const { acknowledgeLowStock } = useNotifications();
  const hasAcknowledgedRef = useRef(false);
  const isFetchingRef = useRef(false);

  const loadData = async (isBackground = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (!isBackground) {
      setIsLoading(true);
    }
    try {
      const [itemsData, logsData] = await Promise.all([
        fetchInventory(),
        fetchInventoryLogs(undefined, 100)
      ]);
      const items = Array.isArray(itemsData) ? itemsData : [];
      setInventory(items);
      setLogs(Array.isArray(logsData) ? logsData : []);

      // Check if there are unacknowledged low-stock items being viewed
      const hasUnacknowledgedLowStock = items.some(item => {
        const threshold = item.lowStockThreshold !== undefined ? Number(item.lowStockThreshold) : 10;
        return Number(item.quantity ?? 0) <= threshold && item.lowStockAcknowledged !== true;
      });

      if (hasUnacknowledgedLowStock && !hasAcknowledgedRef.current) {
        hasAcknowledgedRef.current = true;
        acknowledgeLowStock();
      }
    } catch (err: any) {
      console.error('Error loading inventory data:', err);
    } finally {
      if (!isBackground) {
        setIsLoading(false);
      }
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    hasAcknowledgedRef.current = false;
    loadData();

    const interval = setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        loadData(true);
      }
    }, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadData(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleAdd = async () => {
    if (!newItem.name.trim()) {
      setErrorMessage('Item name is required');
      return;
    }
    const parsedQty = normalizeQuantity(newItem.quantity, 0);
    if (parsedQty < 0) {
      setErrorMessage('Quantity cannot be negative');
      return;
    }

    const parsedStable = normalizeQuantity(newItem.stableQuantity, 0);
    if (parsedStable < 0) {
      setErrorMessage('Stable quantity cannot be negative');
      return;
    }

    const parsedThreshold = normalizeQuantity(newItem.lowStockThreshold, 10);
    if (parsedThreshold < 0) {
      setErrorMessage('Low stock threshold cannot be negative');
      return;
    }

    setErrorMessage('');
    try {
      const created = await createInventoryItem({
        ...newItem,
        quantity: parsedQty,
        stableQuantity: parsedStable,
        lowStockThreshold: parsedThreshold
      });
      setInventory(prev => {
        // Prevent duplicate items in state
        const exists = prev.some(i => i.id === created.id);
        return exists ? prev.map(i => i.id === created.id ? created : i) : [...prev, created];
      });
      setNewItem({ name: '', quantity: '0', unit: 'pcs', stableQuantity: '0', lowStockThreshold: '10' });
      setIsAdding(false);
      // Refresh logs
      fetchInventoryLogs(undefined, 100).then(setLogs).catch(console.error);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add inventory item');
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: 'Delete Inventory Item?',
      message: 'Are you sure you want to delete this inventory item? This will be recorded in audit logs.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive'
    });
    if (!confirmed) return;

    try {
      await deleteInventoryItem(id);
      setInventory(prev => prev.filter(item => item.id !== id));
      fetchInventoryLogs(undefined, 100).then(setLogs).catch(console.error);
    } catch (err: any) {
      alert(err.message || 'Failed to delete inventory item');
    }
  };

  const handleStartEdit = (item: any) => {
    setEditingId(item.id);
    setEditItem({ 
      name: item.name, 
      quantity: formatDisplayQuantity(item.quantity), 
      unit: item.unit || 'pcs', 
      stableQuantity: formatDisplayQuantity(item.stableQuantity ?? 0), 
      lowStockThreshold: formatDisplayQuantity(item.lowStockThreshold ?? 10) 
    });
  };

  const handleSaveEdit = async () => {
    if (!editItem.name.trim()) {
      alert('Item name is required');
      return;
    }
    const parsedQty = normalizeQuantity(editItem.quantity, 0);
    if (parsedQty < 0) {
      alert('Quantity cannot be negative');
      return;
    }

    const parsedStable = normalizeQuantity(editItem.stableQuantity, 0);
    if (parsedStable < 0) {
      alert('Stable quantity cannot be negative');
      return;
    }

    const parsedThreshold = normalizeQuantity(editItem.lowStockThreshold, 10);
    if (parsedThreshold < 0) {
      alert('Low stock threshold cannot be negative');
      return;
    }

    try {
      const updated = await updateInventoryItem(editingId!, {
        ...editItem,
        quantity: parsedQty,
        stableQuantity: parsedStable,
        lowStockThreshold: parsedThreshold
      });
      setInventory(prev => prev.map(item => item.id === editingId ? updated : item));
      setEditingId(null);
      fetchInventoryLogs(undefined, 100).then(setLogs).catch(console.error);
    } catch (err: any) {
      alert(err.message || 'Failed to save changes');
    }
  };

  const handleOpenAdjust = (item: any, type: 'stock-in' | 'stock-out' | 'manual-adjustment') => {
    setAdjustingItem(item);
    setAdjustType(type);
    setAdjustAmount(type === 'manual-adjustment' ? formatDisplayQuantity(item.quantity) : '1');
    setAdjustReason('');
  };

  const handleApplyAdjust = async () => {
    if (!adjustingItem) return;
    const parsedAmount = normalizeQuantity(adjustAmount, 0);

    if (adjustType === 'manual-adjustment' && parsedAmount < 0) {
      alert('Manual quantity cannot be negative');
      return;
    }
    if ((adjustType === 'stock-in' || adjustType === 'stock-out') && parsedAmount <= 0) {
      alert('Amount must be greater than 0');
      return;
    }

    try {
      const result = await adjustInventoryStock(adjustingItem.id, {
        type: adjustType,
        amount: adjustType !== 'manual-adjustment' ? parsedAmount : undefined,
        newQuantity: adjustType === 'manual-adjustment' ? parsedAmount : undefined,
        reason: adjustReason.trim() || undefined
      });

      if (result.item) {
        setInventory(prev => prev.map(item => item.id === adjustingItem.id ? result.item : item));
      }
      setAdjustingItem(null);
      fetchInventoryLogs(undefined, 100).then(setLogs).catch(console.error);
    } catch (err: any) {
      alert(err.message || 'Stock adjustment failed');
    }
  };

  const filteredInventory = inventory.filter(item => 
    item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.unit?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedInventory = useMemo(() => {
    return [...filteredInventory].sort((a, b) => {
      const aThreshold = a.lowStockThreshold !== undefined ? a.lowStockThreshold : 10;
      const bThreshold = b.lowStockThreshold !== undefined ? b.lowStockThreshold : 10;

      const aLow = Number(a.quantity ?? 0) <= aThreshold;
      const bLow = Number(b.quantity ?? 0) <= bThreshold;

      // Low-stock items must ALWAYS appear before normal-stock items
      if (aLow && !bLow) return -1;
      if (!aLow && bLow) return 1;

      // Within the same stock group (both low or both normal), sort by quantity
      const aQty = Number(a.quantity ?? 0);
      const bQty = Number(b.quantity ?? 0);

      if (aQty !== bQty) {
        return quantitySort === 'high-to-low' ? bQty - aQty : aQty - bQty;
      }

      // If two items have the same quantity, use item name as alphabetical A -> Z tie-breaker
      const aName = (a.name || '').trim();
      const bName = (b.name || '').trim();
      return aName.localeCompare(bName);
    });
  }, [filteredInventory, quantitySort]);

  const lowStockCount = inventory.filter(item => Number(item.quantity ?? 0) <= Number(item.lowStockThreshold ?? 10)).length;

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header and Action Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white p-1 rounded-lg border border-gray-300 flex gap-1">
              <button
                onClick={() => setActiveTab('inventory')}
                className={`px-3.5 py-1.5 rounded text-xs font-bold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'inventory' 
                    ? 'bg-dark text-white' 
                    : 'text-gray-600 hover:text-dark'
                }`}
              >
                <Package size={14} /> Inventory Items ({inventory.length})
              </button>
              <button
                onClick={() => setActiveTab('logs')}
                className={`px-3.5 py-1.5 rounded text-xs font-bold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'logs' 
                    ? 'bg-dark text-white' 
                    : 'text-gray-600 hover:text-dark'
                }`}
              >
                <History size={14} /> Audit Trail ({logs.length})
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {activeTab === 'inventory' && (
              <button 
                onClick={() => { setIsAdding(true); setErrorMessage(''); }}
                className="w-full sm:w-auto bg-dark text-white px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 hover:bg-primary transition-colors text-xs uppercase tracking-wider active:translate-y-0.5"
              >
                <Plus size={16} /> Add Item
              </button>
            )}
          </div>
        </div>

        {/* Manage Inventory Content */}
        {activeTab === 'inventory' && (
          <div className="space-y-4">
            {/* Search Filter & Quantity Sorting Control */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search raw materials, units, or items..."
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-xs font-medium focus:outline-none focus:border-dark text-dark"
                />
              </div>

              {/* Compact Quantity Sorting Control */}
              <CustomSelect
                id="inventory-quantity-sort"
                icon={<ArrowUpDown size={14} className="text-gray-400" />}
                labelPrefix="Sort: Quantity"
                value={quantitySort}
                onChange={(val) => setQuantitySort(val as 'high-to-low' | 'low-to-high')}
                options={[
                  { value: 'high-to-low', label: 'High → Low' },
                  { value: 'low-to-high', label: 'Low → High' }
                ]}
                triggerClassName="bg-white px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-bold text-dark hover:border-dark focus:outline-none cursor-pointer shrink-0"
              />
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-[10px] uppercase tracking-wider font-bold">
                    <th className="p-4">Item Name</th>
                    <th className="p-4">Current Stock</th>
                    <th className="p-4">Stable Qty</th>
                    <th className="p-4">Low Stock Alert</th>
                    <th className="p-4">Unit</th>
                    <th className="p-4 text-center">Stock Actions</th>
                    <th className="p-4 text-right">Edit/Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <AnimatePresence>
                    {isAdding && (
                      <tr className="bg-gray-50">
                        <td className="p-3">
                          <input 
                            type="text" 
                            placeholder="e.g. Chicken Leg"
                            value={newItem.name}
                            onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                            className="w-full px-3 py-1.5 rounded-lg border border-gray-300 focus:outline-none focus:border-dark text-xs font-semibold text-dark"
                          />
                        </td>
                        <td className="p-3">
                          <input 
                            type="number" 
                            step="any"
                            min="0"
                            value={newItem.quantity}
                            onChange={(e) => setNewItem({...newItem, quantity: e.target.value})}
                            onBlur={() => setNewItem(prev => ({ ...prev, quantity: formatDisplayQuantity(prev.quantity) }))}
                            className="w-full px-3 py-1.5 rounded-lg border border-gray-300 focus:outline-none focus:border-dark text-xs font-semibold text-dark"
                          />
                        </td>
                        <td className="p-3">
                          <input 
                            type="number" 
                            step="any"
                            min="0"
                            value={newItem.stableQuantity}
                            onChange={(e) => setNewItem({...newItem, stableQuantity: e.target.value})}
                            onBlur={() => setNewItem(prev => ({ ...prev, stableQuantity: formatDisplayQuantity(prev.stableQuantity) }))}
                            className="w-full px-3 py-1.5 rounded-lg border border-gray-300 focus:outline-none focus:border-dark text-xs text-dark"
                            placeholder="Stable Qty"
                          />
                        </td>
                        <td className="p-3">
                          <input 
                            type="number" 
                            step="any"
                            min="0"
                            value={newItem.lowStockThreshold}
                            onChange={(e) => setNewItem({...newItem, lowStockThreshold: e.target.value})}
                            onBlur={() => setNewItem(prev => ({ ...prev, lowStockThreshold: formatDisplayQuantity(prev.lowStockThreshold) }))}
                            className="w-full px-3 py-1.5 rounded-lg border border-gray-300 focus:outline-none focus:border-dark text-xs text-dark"
                            placeholder="Alert at..."
                          />
                        </td>
                        <td className="p-3">
                          <CustomSelect 
                            value={newItem.unit}
                            onChange={(val) => setNewItem({...newItem, unit: val})}
                            options={UNIT_OPTIONS.map(unit => ({ value: unit, label: unit }))}
                            className="w-full"
                            triggerClassName="w-full px-3 py-1.5 rounded-lg border border-gray-300 focus:outline-none focus:border-dark text-xs bg-white font-semibold text-dark cursor-pointer"
                          />
                        </td>
                        <td className="p-3 text-center text-xs text-gray-400 font-medium">Initial Entry</td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button onClick={handleAdd} className="p-1.5 bg-dark text-white rounded hover:bg-primary transition-colors"><Save size={15} /></button>
                            <button onClick={() => setIsAdding(false)} className="p-1.5 bg-white border border-gray-300 text-gray-600 rounded hover:bg-gray-100 transition-colors"><X size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>

                  {sortedInventory.map((item, idx) => {
                    const isLow = Number(item.quantity ?? 0) <= Number(item.lowStockThreshold ?? 10);
                    const itemKey = item.id ? `inv-row-${item.id}` : `inv-row-idx-${idx}`;
                    return (
                      <tr key={itemKey} className="hover:bg-gray-50 transition-colors">
                        <td className="p-4">
                          {editingId === item.id ? (
                            <input 
                              type="text" 
                              value={editItem.name}
                              onChange={(e) => setEditItem({...editItem, name: e.target.value})}
                              className="w-full px-3 py-1.5 rounded-lg border border-gray-300 focus:outline-none focus:border-dark text-xs font-semibold text-dark"
                            />
                          ) : (
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 bg-gray-100 border border-gray-200 rounded-lg flex items-center justify-center text-gray-500">
                                <Package size={16} />
                              </div>
                              <div>
                                <span className="font-bold text-dark text-xs">{item.name}</span>
                                <p className="text-[10px] text-gray-400 font-medium">{item.id}</p>
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          {editingId === item.id ? (
                            <input 
                              type="number" 
                              step="any"
                              min="0"
                              value={editItem.quantity}
                              onChange={(e) => setEditItem({...editItem, quantity: e.target.value})}
                              onBlur={() => setEditItem(prev => ({ ...prev, quantity: formatDisplayQuantity(prev.quantity) }))}
                              className="w-full px-3 py-1.5 rounded-lg border border-gray-300 focus:outline-none focus:border-dark text-xs font-bold text-dark"
                            />
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-black ${isLow ? 'text-red-600' : 'text-dark'}`}>
                                {formatDisplayQuantity(item.quantity)}
                              </span>
                              <span className="text-xs text-gray-500">{item.unit}</span>
                              {isLow && (
                                <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 text-[9px] font-bold uppercase tracking-wider border border-red-200">
                                  Low
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          {editingId === item.id ? (
                            <input 
                              type="number" 
                              step="any"
                              min="0"
                              value={editItem.stableQuantity}
                              onChange={(e) => setEditItem({...editItem, stableQuantity: e.target.value})}
                              onBlur={() => setEditItem(prev => ({ ...prev, stableQuantity: formatDisplayQuantity(prev.stableQuantity) }))}
                              className="w-full px-3 py-1.5 rounded-lg border border-gray-300 focus:outline-none focus:border-dark text-xs text-dark"
                            />
                          ) : (
                            <span className="text-gray-600 text-xs font-medium">{formatDisplayQuantity(item.stableQuantity)}</span>
                          )}
                        </td>
                        <td className="p-4">
                          {editingId === item.id ? (
                            <input 
                              type="number" 
                              step="any"
                              min="0"
                              value={editItem.lowStockThreshold}
                              onChange={(e) => setEditItem({...editItem, lowStockThreshold: e.target.value})}
                              onBlur={() => setEditItem(prev => ({ ...prev, lowStockThreshold: formatDisplayQuantity(prev.lowStockThreshold) }))}
                              className="w-full px-3 py-1.5 rounded-lg border border-gray-300 focus:outline-none focus:border-dark text-xs text-dark"
                            />
                          ) : (
                            <span className="text-gray-600 text-xs font-medium">{formatDisplayQuantity(item.lowStockThreshold ?? 10)}</span>
                          )}
                        </td>
                        <td className="p-4">
                          {editingId === item.id ? (
                            <CustomSelect 
                              value={editItem.unit}
                              onChange={(val) => setEditItem({...editItem, unit: val})}
                              options={UNIT_OPTIONS.map(unit => ({ value: unit, label: unit }))}
                              className="w-full"
                              triggerClassName="w-full px-3 py-1.5 rounded-lg border border-gray-300 focus:outline-none focus:border-dark text-xs bg-white font-semibold text-dark cursor-pointer"
                            />
                          ) : (
                            <span className="text-gray-600 text-xs font-bold uppercase">{item.unit}</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenAdjust(item, 'stock-in')}
                              className="px-2 py-1 bg-green-50 text-green-700 hover:bg-green-100 rounded text-xs font-bold transition-colors flex items-center gap-1 border border-green-200"
                              title="Stock In"
                            >
                              <TrendingUp size={12} /> +In
                            </button>
                            <button
                              onClick={() => handleOpenAdjust(item, 'stock-out')}
                              className="px-2 py-1 bg-red-50 text-red-700 hover:bg-red-100 rounded text-xs font-bold transition-colors flex items-center gap-1 border border-red-200"
                              title="Stock Out"
                            >
                              <TrendingDown size={12} /> -Out
                            </button>
                            <button
                              onClick={() => handleOpenAdjust(item, 'manual-adjustment')}
                              className="p-1 text-gray-500 hover:text-dark hover:bg-gray-100 rounded text-xs font-bold transition-colors border border-gray-200"
                              title="Set Count"
                            >
                              <SlidersHorizontal size={13} />
                            </button>
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            {editingId === item.id ? (
                              <>
                                <button onClick={handleSaveEdit} className="p-1.5 text-white bg-dark hover:bg-primary rounded transition-colors" title="Save"><Save size={14} /></button>
                                <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-600 border border-gray-300 hover:bg-gray-100 rounded transition-colors" title="Cancel"><X size={14} /></button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => handleStartEdit(item)} className="p-1.5 text-gray-600 border border-gray-200 hover:border-dark hover:text-dark rounded transition-colors" title="Edit"><Edit2 size={14} /></button>
                                <button onClick={() => handleDelete(item.id)} className="p-1.5 text-gray-600 border border-gray-200 hover:text-red-600 hover:border-red-300 rounded transition-colors" title="Delete"><Trash2 size={14} /></button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              <AnimatePresence>
                {isAdding && (
                  <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Item Name</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Chicken Leg"
                        value={newItem.name}
                        onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                        className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-dark"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Quantity</label>
                        <input 
                          type="number" 
                          step="any"
                          min="0"
                          value={newItem.quantity}
                          onChange={(e) => setNewItem({...newItem, quantity: e.target.value})}
                          onBlur={() => setNewItem(prev => ({ ...prev, quantity: formatDisplayQuantity(prev.quantity) }))}
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-dark"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Stable Qty</label>
                        <input 
                          type="number" 
                          step="any"
                          min="0"
                          value={newItem.stableQuantity}
                          onChange={(e) => setNewItem({...newItem, stableQuantity: e.target.value})}
                          onBlur={() => setNewItem(prev => ({ ...prev, stableQuantity: formatDisplayQuantity(prev.stableQuantity) }))}
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-300 text-xs text-dark"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Alert At</label>
                        <input 
                          type="number" 
                          step="any"
                          min="0"
                          value={newItem.lowStockThreshold}
                          onChange={(e) => setNewItem({...newItem, lowStockThreshold: e.target.value})}
                          onBlur={() => setNewItem(prev => ({ ...prev, lowStockThreshold: formatDisplayQuantity(prev.lowStockThreshold) }))}
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-300 text-xs text-dark"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Unit</label>
                      <CustomSelect 
                        value={newItem.unit}
                        onChange={(val) => setNewItem({...newItem, unit: val})}
                        options={UNIT_OPTIONS.map(unit => ({ value: unit, label: unit }))}
                        className="w-full"
                        triggerClassName="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-xs bg-white font-semibold text-dark cursor-pointer"
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={handleAdd} className="flex-1 bg-dark text-white py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-primary transition-colors">Add Item</button>
                      <button onClick={() => setIsAdding(false)} className="flex-1 bg-white border border-gray-300 text-gray-700 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-gray-100 transition-colors">Cancel</button>
                    </div>
                  </div>
                )}
              </AnimatePresence>

              {sortedInventory.map((item, idx) => {
                const isLow = Number(item.quantity ?? 0) <= Number(item.lowStockThreshold ?? 10);
                const cardKey = item.id ? `inv-card-${item.id}` : `inv-card-idx-${idx}`;
                return (
                  <div key={cardKey} className="bg-white p-4 rounded-xl border border-gray-200 space-y-3">
                    {editingId === item.id ? (
                      <div className="space-y-3">
                        <input 
                          type="text" 
                          value={editItem.name}
                          onChange={(e) => setEditItem({...editItem, name: e.target.value})}
                          className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-dark"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <input 
                            type="number" 
                            step="any"
                            min="0"
                            value={editItem.quantity}
                            onChange={(e) => setEditItem({...editItem, quantity: e.target.value})}
                            onBlur={() => setEditItem(prev => ({ ...prev, quantity: formatDisplayQuantity(prev.quantity) }))}
                            className="w-full px-2 py-1.5 rounded-lg border border-gray-300 text-xs font-bold text-dark"
                          />
                          <input 
                            type="number" 
                            step="any"
                            min="0"
                            value={editItem.stableQuantity}
                            onChange={(e) => setEditItem({...editItem, stableQuantity: e.target.value})}
                            onBlur={() => setEditItem(prev => ({ ...prev, stableQuantity: formatDisplayQuantity(prev.stableQuantity) }))}
                            className="w-full px-2 py-1.5 rounded-lg border border-gray-300 text-xs text-dark"
                          />
                          <input 
                            type="number" 
                            step="any"
                            min="0"
                            value={editItem.lowStockThreshold}
                            onChange={(e) => setEditItem({...editItem, lowStockThreshold: e.target.value})}
                            onBlur={() => setEditItem(prev => ({ ...prev, lowStockThreshold: formatDisplayQuantity(prev.lowStockThreshold) }))}
                            className="w-full px-2 py-1.5 rounded-lg border border-gray-300 text-xs text-dark"
                          />
                        </div>
                        <CustomSelect 
                          value={editItem.unit}
                          onChange={(val) => setEditItem({...editItem, unit: val})}
                          options={UNIT_OPTIONS.map(unit => ({ value: unit, label: unit }))}
                          className="w-full"
                          triggerClassName="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-xs bg-white font-semibold text-dark cursor-pointer"
                        />
                        <div className="flex gap-2">
                          <button onClick={handleSaveEdit} className="flex-1 bg-dark text-white py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-primary transition-colors">Save</button>
                          <button onClick={() => setEditingId(null)} className="flex-1 bg-white border border-gray-300 text-gray-700 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-gray-100 transition-colors">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 bg-gray-100 border border-gray-200 rounded-lg flex items-center justify-center text-gray-500">
                              <Package size={16} />
                            </div>
                            <div>
                              <h3 className="font-bold text-dark text-xs">{item.name}</h3>
                              <p className="text-[10px] text-gray-400 uppercase font-medium">{item.unit}</p>
                            </div>
                          </div>
                          <div className="flex gap-1.5">
                            <button onClick={() => handleStartEdit(item)} className="p-1 text-gray-500 border border-gray-200 rounded hover:text-dark hover:border-dark"><Edit2 size={14} /></button>
                            <button onClick={() => handleDelete(item.id)} className="p-1 text-gray-500 border border-gray-200 rounded hover:text-red-600 hover:border-red-300"><Trash2 size={14} /></button>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-1">
                          <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Current</p>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-base font-black ${isLow ? 'text-red-600' : 'text-dark'}`}>
                                {formatDisplayQuantity(item.quantity)}
                              </span>
                              {isLow && <AlertCircle size={12} className="text-red-600" />}
                            </div>
                          </div>
                          <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Stable</p>
                            <span className="text-base font-bold text-gray-600">{formatDisplayQuantity(item.stableQuantity)}</span>
                          </div>
                          <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Alert At</p>
                            <span className="text-base font-bold text-gray-600">{formatDisplayQuantity(item.lowStockThreshold ?? 10)}</span>
                          </div>
                        </div>

                        {/* Quick Stock Buttons Mobile */}
                        <div className="flex gap-2 pt-1 border-t border-gray-200">
                          <button
                            onClick={() => handleOpenAdjust(item, 'stock-in')}
                            className="flex-1 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1 border border-green-200"
                          >
                            <TrendingUp size={13} /> +In
                          </button>
                          <button
                            onClick={() => handleOpenAdjust(item, 'stock-out')}
                            className="flex-1 py-1.5 bg-red-50 text-red-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1 border border-red-200"
                          >
                            <TrendingDown size={13} /> -Out
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Audit Logs Tab Content */}
        {activeTab === 'logs' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-gray-200">
              <div>
                <h3 className="font-bold text-dark text-sm uppercase tracking-wider">Inventory Activity & Audit Trail</h3>
                <p className="text-xs text-gray-500">History of stock additions, deductions, adjustments, and orders.</p>
              </div>
              <button 
                onClick={() => fetchInventoryLogs(undefined, 100).then(setLogs)}
                className="text-xs font-bold text-dark hover:text-primary transition-colors"
              >
                Refresh Log
              </button>
            </div>

            {logs.length === 0 ? (
              <div className="text-center py-8 text-gray-400 font-medium text-xs">
                No inventory logs recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {logs.map((log, logIdx) => {
                  const isPositive = log.quantityChange > 0;
                  const isZero = log.quantityChange === 0;
                  const logKey = log.id ? `log-${log.id}-${logIdx}` : `log-idx-${logIdx}`;
                  return (
                    <div key={logKey} className="py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 hover:bg-gray-50 rounded-lg px-2 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                          log.type === 'stock-in' ? 'bg-green-50 text-green-700 border-green-200' :
                          log.type === 'stock-out' ? 'bg-red-50 text-red-700 border-red-200' :
                          log.type === 'order-deduction' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {log.type === 'stock-in' ? <ArrowUpRight size={15} /> :
                           log.type === 'stock-out' ? <ArrowDownRight size={15} /> :
                           <SlidersHorizontal size={14} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-dark text-xs">{log.itemName}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 uppercase tracking-wider border border-gray-200">
                              {log.type}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 font-medium mt-0.5">{log.reason || 'Inventory movement'}</p>
                          <div className="flex items-center gap-2 text-[10px] text-gray-400 font-medium mt-0.5">
                            <span>By: {log.performedBy || 'Staff'}</span>
                            <span>•</span>
                            <span>{new Date(log.date || log.createdAt).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right sm:text-right w-full sm:w-auto pl-11 sm:pl-0">
                        <div className={`font-black text-sm ${isPositive ? 'text-green-700' : isZero ? 'text-gray-600' : 'text-red-600'}`}>
                          {isPositive ? `+${formatDisplayQuantity(log.quantityChange)}` : formatDisplayQuantity(log.quantityChange)}
                        </div>
                        <div className="text-[11px] text-gray-500 font-medium">
                          Remaining: <span className="text-dark font-bold">{formatDisplayQuantity(log.remainingQuantity)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Quick Stock Adjustment Modal */}
        <AnimatePresence>
          {adjustingItem && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div 
                className="bg-white rounded-xl border border-gray-200 w-full max-w-md overflow-hidden"
              >
                <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                  <div>
                    <h3 className="font-black text-dark text-sm uppercase tracking-wide">
                      {adjustType === 'stock-in' ? 'Stock In (Replenish)' :
                       adjustType === 'stock-out' ? 'Stock Out (Deduct)' :
                       'Manual Stock Count'}
                    </h3>
                    <p className="text-xs text-gray-500 font-medium">{adjustingItem.name} (Current: {formatDisplayQuantity(adjustingItem.quantity)} {adjustingItem.unit})</p>
                  </div>
                  <button onClick={() => setAdjustingItem(null)} className="text-gray-400 hover:text-dark">
                    <X size={18} />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">
                      {adjustType === 'manual-adjustment' ? `New Total Quantity (${adjustingItem.unit})` : `Amount to ${adjustType === 'stock-in' ? 'Add' : 'Deduct'} (${adjustingItem.unit})`}
                    </label>
                    <input 
                      type="number" 
                      step="any"
                      min={adjustType === 'manual-adjustment' ? '0' : '0.0001'}
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(e.target.value)}
                      onBlur={() => setAdjustAmount(prev => formatDisplayQuantity(prev))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-dark text-sm font-bold text-dark"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Reason / Memo (Optional)</label>
                    <input 
                      type="text" 
                      placeholder={adjustType === 'stock-in' ? 'e.g. Supplier delivery invoice #104' : 'e.g. Spoiled or kitchen prep'}
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-dark text-xs text-dark"
                    />
                  </div>
                </div>

                <div className="p-4 bg-gray-50 border-t border-gray-200 flex gap-2">
                  <button 
                    onClick={() => setAdjustingItem(null)}
                    className="flex-1 bg-white border border-gray-300 text-gray-700 py-2 rounded-lg font-bold hover:bg-gray-100 transition-colors text-xs uppercase tracking-wider"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleApplyAdjust}
                    className={`flex-1 text-white py-2 rounded-lg font-bold transition-colors text-xs uppercase tracking-wider active:translate-y-0.5 ${
                      adjustType === 'stock-out' 
                        ? 'bg-red-600 hover:bg-red-700' 
                        : 'bg-dark hover:bg-primary'
                    }`}
                  >
                    Confirm Change
                  </button>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Loading Spinner */}
        {isLoading && (
          <div className="flex items-center justify-center p-12">
            <Loader2 size={28} className="animate-spin text-dark" />
          </div>
        )}
      </div>
    </div>
  );
};

export default ManageInventory;
