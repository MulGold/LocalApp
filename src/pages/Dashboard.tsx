import { useState, useEffect, useRef } from 'react';
import { fetchOrders } from '../api/orderService';
import { fetchInventory } from '../api/inventoryService';
import { formatPrice } from '../utils/format';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { DollarSign, ShoppingBag, AlertTriangle, TrendingUp, Package } from 'lucide-react';

const Dashboard = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isFetchingRef = useRef(false);

  const loadData = async (isBackground = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (!isBackground) {
      setIsLoading(true);
    }
    try {
      const [ordersData, inventoryData] = await Promise.all([
        fetchOrders(),
        fetchInventory()
      ]);
      setOrders(ordersData || []);
      setInventory(inventoryData || []);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      if (!isBackground) {
        setIsLoading(false);
      }
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
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

  const today = new Date().toDateString();
  const completedOrders = orders.filter(o => o.status === 'Completed');
  const todayOrders = completedOrders.filter(
    o => new Date(o.date).toDateString() === today
  );
  const todaySales = todayOrders.reduce((sum, o) => sum + o.total, 0);
  
  const readyToPickupOrders = orders.filter(o => o.status === 'Ready to Pickup' || o.status === 'Ready for Pickup').length;
  const lowStockCount = inventory.filter(item => item.quantity <= (item.lowStockThreshold || 10)).length;

  // Prepare Inventory Data for Chart
  const inventoryData = inventory.map(item => ({
    name: item.name,
    quantity: item.quantity,
  }));

  // Prepare Product Rankings Data (Today)
  const productSales: { [key: string]: number } = {};
  todayOrders.forEach(order => {
    order.items.forEach((item: any) => {
      productSales[item.name] = (productSales[item.name] || 0) + item.quantity;
    });
  });

  const rankingData = Object.entries(productSales)
    .map(([name, sales]) => ({ name, sales }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5);

  const getBarColor = (item: any) => {
    const threshold = item.lowStockThreshold || 10;
    if (item.quantity <= threshold) return '#ef4444'; // Red
    if (item.quantity <= threshold * 2) return '#eab308'; // Yellow
    return '#3b82f6'; // Blue/Stable
  };

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 font-sans">
      <div className="max-w-7xl mx-auto">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* Total Sales */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 flex justify-between items-center">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                Today's Sales
              </p>
              <h3 className="text-2xl font-black text-dark tracking-tight">{formatPrice(todaySales)}</h3>
            </div>
            <div className="w-10 h-10 bg-green-50 text-green-700 border border-green-200 rounded-lg flex items-center justify-center">
              <DollarSign size={20} />
            </div>
          </div>

          {/* Ready to Pickup Orders */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 flex justify-between items-center">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Ready for Pickup</p>
              <h3 className="text-2xl font-black text-dark tracking-tight">{readyToPickupOrders}</h3>
              <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase">Active pick-up orders</p>
            </div>
            <div className="w-10 h-10 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg flex items-center justify-center">
              <ShoppingBag size={20} />
            </div>
          </div>

          {/* Low Stock Alerts */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 flex justify-between items-center">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Low Stock Alerts</p>
              <h3 className="text-2xl font-black text-dark tracking-tight">{lowStockCount}</h3>
              <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase">{lowStockCount > 0 ? "Items require restocking" : "Stock levels optimal"}</p>
            </div>
            <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${lowStockCount > 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
              <AlertTriangle size={20} />
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Inventory Levels Chart */}
          <div className="bg-white p-6 rounded-xl border border-gray-200">
            <div className="flex items-center gap-2 mb-6">
              <div className="p-1.5 bg-gray-100 rounded border border-gray-200 text-gray-600">
                <Package size={16} />
              </div>
              <h2 className="text-sm font-bold text-dark uppercase tracking-wider">Current Inventory Levels</h2>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={inventoryData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 600 }}
                    dy={10}
                  />
                  <YAxis 
                    domain={[0, 60]} 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 600 }}
                  />
                  <Tooltip 
                    cursor={{ fill: '#f9fafb' }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: 'none', fontSize: '12px', fontWeight: 600 }}
                  />
                  <Bar dataKey="quantity" radius={[4, 4, 0, 0]} barSize={32}>
                    {inventory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getBarColor(entry)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Product Rankings Chart */}
          <div className="bg-white p-6 rounded-xl border border-gray-200">
            <div className="flex items-center gap-2 mb-6">
              <div className="p-1.5 bg-gray-100 rounded border border-gray-200 text-gray-600">
                <TrendingUp size={16} />
              </div>
              <h2 className="text-sm font-bold text-dark uppercase tracking-wider">
                Top Ordered Items (Today)
              </h2>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rankingData} layout="vertical" margin={{ top: 10, right: 20, left: 40, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#374151', fontSize: 11, fontWeight: 700 }}
                    width={100}
                  />
                  <Tooltip 
                    cursor={{ fill: '#f9fafb' }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: 'none', fontSize: '12px', fontWeight: 600 }}
                  />
                  <Bar dataKey="sales" fill="#ea580c" radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
