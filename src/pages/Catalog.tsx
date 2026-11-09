import { useState, useEffect, useContext } from 'react';
import ProductCard from '../components/ProductCard';
import { fetchProducts, fetchCategories, CATEGORIES } from '../api/productService';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Search, UtensilsCrossed } from 'lucide-react';

const Catalog = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [categoriesList, setCategoriesList] = useState<string[]>(CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const { user } = useContext(AuthContext) as any;
  const navigate = useNavigate();

  useEffect(() => {
    if (user && user.role !== 'customer') {
      navigate('/dashboard');
      return;
    }

    const loadData = async () => {
      try {
        const [productsData, catsData] = await Promise.all([
          fetchProducts(),
          fetchCategories()
        ]);
        setProducts(productsData);
        if (Array.isArray(catsData) && catsData.length > 0) {
          setCategoriesList(catsData);
        }
      } catch (error) {
        console.error('Failed to load menu catalog or categories:', error);
      }
    };

    loadData();
  }, [user, navigate]);

  if (user && user.role !== 'customer') return null;

  // Combine dynamic categories list with 'All'
  const categories = ['All', ...categoriesList];

  // Filter products based on selected category and search term (matching menu item name only)
  const filteredProducts = products.filter(p => {
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch = q === '' || (p.name ? p.name.toLowerCase().includes(q) : false);
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="container mx-auto p-4 sm:p-6 py-6 sm:py-8 max-w-7xl">
      <div className="mb-8 max-w-3xl mx-auto">
        {/* Search Bar */}
        <div className="relative mb-6 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-dark transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Search our delicious dishes..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-lg bg-white border border-gray-300 focus:outline-none focus:border-dark transition-colors text-sm font-medium text-dark placeholder:text-gray-400"
          />
        </div>
        
        {/* Category Filter Bar */}
        <div className="flex flex-wrap justify-center gap-2">
          {categories.map((category) => {
            const isSelected = selectedCategory === category;
            return (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors border ${
                  isSelected 
                    ? 'bg-dark text-white border-dark' 
                    : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
        {filteredProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      
      {filteredProducts.length === 0 && (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-xl p-8 max-w-md mx-auto mt-6">
          <p className="text-gray-500 font-medium text-sm">No items found matching "{searchTerm}".</p>
          <button 
            onClick={() => { setSearchTerm(''); setSelectedCategory('All'); }}
            className="mt-3 text-xs font-bold text-primary hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
};

export default Catalog;
