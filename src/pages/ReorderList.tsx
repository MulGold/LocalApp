import { useState, useEffect } from 'react';
import { fetchInventory } from '../api/inventoryService';
import { Package, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';

const ReorderList = () => {
  const [inventory, setInventory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    fetchInventory()
      .then(items => {
        setInventory(Array.isArray(items) ? items : []);
      })
      .catch(err => {
        console.error('Failed to load inventory for reorder list:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const reorderItems = inventory
    .filter(item => item.quantity < (item.stableQuantity || 0))
    .map(item => ({
      ...item,
      needed: (item.stableQuantity || 0) - item.quantity
    }));

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Loading Spinner */}
        {isLoading && (
          <div className="flex items-center justify-center p-12">
            <Loader2 size={28} className="animate-spin text-dark" />
          </div>
        )}

        {/* Reorder List - Desktop Table */}
        {!isLoading && (
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-[10px] uppercase tracking-wider font-bold">
                  <th className="p-4">Item Name</th>
                  <th className="p-4">Current Stock</th>
                  <th className="p-4">Stable Level</th>
                  <th className="p-4">Quantity to Add</th>
                  <th className="p-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {reorderItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-16 text-center">
                      <Package size={36} className="mx-auto text-gray-300 mb-3" />
                      <p className="text-gray-500 font-medium text-xs">All inventory levels are stable. No reordering needed.</p>
                    </td>
                  </tr>
                ) : (
                  reorderItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 bg-red-50 border border-red-200 rounded-lg flex items-center justify-center text-red-600">
                            <Package size={16} />
                          </div>
                          <span className="font-bold text-dark text-xs">{item.name}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="font-bold text-red-600 text-xs">{item.quantity} {item.unit}</span>
                      </td>
                      <td className="p-4">
                        <span className="text-gray-600 font-medium text-xs">{item.stableQuantity} {item.unit}</span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 text-dark font-bold text-xs">
                          <ArrowRight size={14} className="text-gray-400" />
                          <span>+{item.needed} {item.unit}</span>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-[9px] font-bold uppercase tracking-wider border border-red-200">
                          Low Stock
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Reorder List - Mobile Cards */}
        {!isLoading && (
          <div className="md:hidden space-y-3">
            {reorderItems.length === 0 ? (
              <div className="bg-white p-8 rounded-xl border border-gray-200 text-center">
                <Package size={36} className="mx-auto text-gray-300 mb-2" />
                <p className="text-gray-500 font-medium text-xs">All levels stable.</p>
              </div>
            ) : (
              reorderItems.map((item) => (
                <div key={item.id} className="bg-white p-4 rounded-xl border border-gray-200 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 bg-red-50 border border-red-200 rounded-lg flex items-center justify-center text-red-600">
                        <Package size={16} />
                      </div>
                      <h3 className="font-bold text-dark text-xs">{item.name}</h3>
                    </div>
                    <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-[9px] font-bold uppercase tracking-wider border border-red-200">
                      Low Stock
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Current</p>
                      <span className="text-sm font-bold text-red-600">{item.quantity} {item.unit}</span>
                    </div>
                    <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Stable</p>
                      <span className="text-sm font-bold text-gray-700">{item.stableQuantity} {item.unit}</span>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Required Add</span>
                    <div className="flex items-center gap-1.5 text-dark font-bold text-xs">
                      <ArrowRight size={13} className="text-gray-400" />
                      <span>+{item.needed} {item.unit}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {!isLoading && reorderItems.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
            <AlertTriangle className="text-amber-700 shrink-0 mt-0.5" size={18} />
            <div>
              <h4 className="text-amber-900 font-bold text-xs uppercase tracking-wider">Restock Required</h4>
              <p className="text-amber-800 text-xs mt-0.5">
                There are {reorderItems.length} items currently below their stable quantity threshold. Please replenish stock with suppliers.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReorderList;
