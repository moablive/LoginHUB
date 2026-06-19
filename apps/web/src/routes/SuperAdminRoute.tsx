import { Navigate, Outlet } from 'react-router-dom';
import { authService } from '../services/authService'; // 

export const SuperAdminRoute = () => {
  const isAuth = authService.isAuthenticated(); // [cite: 153]
  // Verifica se é master olhando o sessionStorage definido no seu authService 
  const isMaster = sessionStorage.getItem('is_super_admin') === 'true'; 

  if (!isAuth || !isMaster) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};
