import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';
import { authApi } from '@loginhub/api-client';

// Layout
import { AdminLayout } from '../layouts/AdminLayout';

// Páginas
import { Login } from '../pages/Login';
import { Dashboard } from '../pages/Dashboard';
import { CreateApp } from '../pages/CreateApp'; 
import { AppUsers } from '../pages/AppUsers';
import { SetupPassword } from '../pages/SetupPassword';

export const SuperAdminRoute = () => {
  const isAuth = authApi.isAuthenticated();
  const isMaster = sessionStorage.getItem('is_super_admin') === 'true'; 

  if (!isAuth || !isMaster) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};


export function AppRoutes() {
  return (
    <>
      <ThemeToggle />
      <Routes>
      
      {/* --- ROTAS PÚBLICAS --- */}
      <Route path="/login" element={<Login />} />
      <Route path="/setup-password" element={<SetupPassword />} />
      
      {/* Redireciona a raiz para o dashboard */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* --- ÁREA DO SUPER ADMIN (Protegida por Master Key) --- */}
      <Route element={<SuperAdminRoute />}>
        
        {/* O Layout contém o Sidebar */}
        <Route element={<AdminLayout />}>
          
          {/* Listagem de Aplicativos (Dashboard) */}
          <Route path="/dashboard" element={<Dashboard />} />
          
          {/* Alias: /apps também leva ao dashboard */}
          <Route path="/apps" element={<Navigate to="/dashboard" replace />} />
          
          {/* Criar Novo Aplicativo */}
          <Route path="/apps/new" element={<CreateApp />} />
          
          {/* Gerenciar Usuários da Aplicativo */}
          <Route path="/apps/:id/users" element={<AppUsers />} />

        </Route>

      </Route>

      {/* Rota 404 -> Login */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </>
  );
}
