import { useContext, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const ProtectedRoute = ({ children, requireAdmin = false }: { children: any; requireAdmin?: boolean }) => {
  const { user, logout } = useContext(AuthContext) as any;
  const location = useLocation();

  const savedExpiry = localStorage.getItem('capstone_session_expiry');
  const isExpired = user && (!savedExpiry || isNaN(Number(savedExpiry)) || Date.now() >= Number(savedExpiry));

  useEffect(() => {
    if (isExpired) {
      logout?.();
    }
  }, [isExpired, logout]);

  // If nobody is logged in or session has expired, send them to the login screen
  if (!user || isExpired) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If the page requires an admin, but a regular customer is logged in, send them home
  if (requireAdmin && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  // If they pass the checks, let them view the page
  return children;
};

export default ProtectedRoute;