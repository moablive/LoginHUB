import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { authApi } from '@loginhub/api-client';

// Layout
import { AdminLayout } from '../layouts/AdminLayout';

// Páginas
import { Login } from '../pages/Login';
import { Dashboard } from '../pages/Dashboard';
import { CreateCompany } from '../pages/CreateCompany'; 
import { CompanyUsers } from '../pages/CompanyUsers';

export const SuperAdminRoute = () => {
  const isAuth = authApi.isAuthenticated();
  const isMaster = sessionStorage.getItem('is_super_admin') === 'true'; 

  if (!isAuth || !isMaster) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};


export function AppRoutes() {
  return (
    <Routes>
      
      {/* --- ROTAS PÚBLICAS --- */}
      <Route path="/login" element={<Login />} />
      
      {/* Redireciona a raiz para o dashboard */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* --- ÁREA DO SUPER ADMIN (Protegida por Master Key) --- */}
      <Route element={<SuperAdminRoute />}>
        
        {/* O Layout contém o Sidebar */}
        <Route element={<AdminLayout />}>
          
          {/* Listagem de Empresas (Dashboard) */}
          <Route path="/dashboard" element={<Dashboard />} />
          
          {/* Alias: /companies também leva ao dashboard */}
          <Route path="/companies" element={<Navigate to="/dashboard" replace />} />
          
          {/* Criar Nova Empresa */}
          <Route path="/companies/new" element={<CreateCompany />} />
          
          {/* Gerenciar Usuários da Empresa */}
          <Route path="/companies/:id/users" element={<CompanyUsers />} />

        </Route>

      </Route>

      {/* Rota 404 -> Login */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
