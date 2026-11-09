import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import { AuthProvider } from './context/AuthContext'; // 1. Import AuthProvider
import { NotificationProvider } from './context/NotificationContext';
import { ConfirmProvider } from './context/ConfirmContext';
import Navbar from './components/NavBar';
import LandingPage from './pages/LandingPage';
import Catalog from './pages/Catalog';
import Checkout from './pages/Checkout';
import AdminDashboard from './pages/AdminDashboard';
import LoginPage from './pages/LoginPages';
import ProtectedRoute from './components/ProtectedRoute';
import OrderHistory from './pages/TransactionHistory'; // Renamed
import MyBill from './pages/MyBill';
import CustomerPayment from './pages/CustomerPayment';
import CustomerOrderHistory from './pages/CustomerOrderHistory';
import About from './pages/About';
import POS from './pages/POS';
import ManageMenu from './pages/ManageMenu';
import ManageInventory from './pages/ManageInventory';
import Dashboard from './pages/Dashboard';
import ReorderList from './pages/ReorderList';
import AccountManagement from './pages/AccountManagement';
import SalesReport from './pages/SalesReport';

function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <CartProvider>
          <ConfirmProvider>
            <Router>
            <div className="min-h-screen bg-white flex flex-col text-dark">
              <Navbar />
              <main className="flex-1">
                <Routes>
                  {/* Public Routes (Menu Browsing & Info) */}
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/menu" element={<Catalog />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/login" element={<LoginPage />} />
                  
                  {/* Customer Authenticated Routes */}
                  <Route path="/checkout" element={
                    <ProtectedRoute>
                      <Checkout />
                    </ProtectedRoute>
                  } />
                  <Route path="/my-orders" element={
                    <ProtectedRoute>
                      <CustomerOrderHistory />
                    </ProtectedRoute>
                  } />
                  <Route path="/order-history" element={<Navigate to="/my-orders" replace />} />
                  <Route path="/my-bill" element={
                  <ProtectedRoute>
                    <MyBill />
                  </ProtectedRoute>
                } />
                
                {/* Protected Route: Transaction history only for logged in admin */}
                <Route path="/history" element={
                  <ProtectedRoute requireAdmin={true}>
                    <OrderHistory />
                  </ProtectedRoute>
                } />

                {/* Customer Payment: for admin */}
                <Route path="/customer-payment" element={
                  <ProtectedRoute requireAdmin={true}>
                    <CustomerPayment />
                  </ProtectedRoute>
                } />

                {/* POS: Point of Sale for admin */}
                <Route path="/pos" element={
                  <ProtectedRoute requireAdmin={true}>
                    <POS />
                  </ProtectedRoute>
                } />

                {/* Manage Menu: ONLY admins */}
                <Route path="/manage-menu" element={
                  <ProtectedRoute requireAdmin={true}>
                    <ManageMenu />
                  </ProtectedRoute>
                } />

                {/* Manage Inventory: ONLY admins */}
                <Route path="/manage-inventory" element={
                  <ProtectedRoute requireAdmin={true}>
                    <ManageInventory />
                  </ProtectedRoute>
                } />

                {/* Dashboard: ONLY admins */}
                <Route path="/dashboard" element={
                  <ProtectedRoute requireAdmin={true}>
                    <Dashboard />
                  </ProtectedRoute>
                } />

                {/* Reorder List: ONLY admins */}
                <Route path="/reorder-list" element={
                  <ProtectedRoute requireAdmin={true}>
                    <ReorderList />
                  </ProtectedRoute>
                } />

                {/* Account Management: ONLY admins */}
                <Route path="/account-management" element={
                  <ProtectedRoute requireAdmin={true}>
                    <AccountManagement />
                  </ProtectedRoute>
                } />

                {/* Sales Report: ONLY admins */}
                <Route path="/sales-report" element={
                  <ProtectedRoute requireAdmin={true}>
                    <SalesReport />
                  </ProtectedRoute>
                } />

                {/* Protected Route: ONLY admins can see the dashboard */}
                <Route path="/admin" element={
                  <ProtectedRoute requireAdmin={true}>
                    <AdminDashboard />
                  </ProtectedRoute>
                } />

                {/* Catch-all Wildcard Route to redirect unknown paths to Home */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </Router>
          </ConfirmProvider>
      </CartProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;