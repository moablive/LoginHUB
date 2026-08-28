import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';
import { VersionBadge } from '../features/version/VersionBadge';
import { UpdateBanner } from '../features/version/UpdateBanner';
import { authApi } from '@loginhub/api-client';

// Layout
import { AdminLayout } from '../layouts/AdminLayout';

// Páginas
import { Login } from '../pages/Login';
import { Dashboard } from '../pages/Dashboard';
import { CreateApp } from '../pages/CreateApp'; 
import { AppUsers } from '../pages/AppUsers';
import { SetupPassword } from '../pages/SetupPassword';
import { Enroll2FA } from '../pages/Enroll2FA';

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
      {/* Fora do <Routes> de proposito: trocar de rota nao pode desmontar o
          aviso de versao nova nem zerar o intervalo da checagem. */}
      <VersionBadge />
      <UpdateBanner />
      <Routes>
      
      {/* --- ROTAS PÚBLICAS --- */}
      <Route path="/login" element={<Login />} />
      <Route path="/setup-password" element={<SetupPassword />} />
      {/* Enrolamento de 2FA compartilhado: os apps clientes mandam para cá com
          o passe de 10 min que o login deles devolveu em `require2FASetup`.
          Uma tela de QR só, em vez de oito divergindo. */}
      <Route path="/enrolar-2fa" element={<Enroll2FA />} />
      
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
