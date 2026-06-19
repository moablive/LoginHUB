import { NavLink } from 'react-router-dom';
import { authService } from '../services/authService';
import { 
  BuildingOfficeIcon, 
  PlusCircleIcon, 
  ArrowLeftOnRectangleIcon 
} from '@heroicons/react/24/outline';

export const Sidebar = () => {
  // Estilos do Tailwind
  const baseClass = "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors mb-1 font-medium";
  const activeClass = "bg-blue-600 text-white shadow-md";
  const inactiveClass = "text-gray-400 hover:bg-gray-800 hover:text-white";

  return (
    <aside className="w-64 bg-[#111827] text-white h-screen flex flex-col border-r border-gray-800 shadow-xl">
      
      {/* Cabeçalho do Sidebar */}
      <div className="h-16 flex items-center px-6 border-b border-gray-800 bg-[#0f1523]">
        <div className="flex items-center gap-2">
          {/* Se tiver logo, coloque aqui */}
          <span className="text-lg font-bold tracking-wide text-white">
            LoginHub <span className="text-blue-500">Admin</span>
          </span>
        </div>
      </div>
      
      <nav className="flex-1 px-3 py-6 space-y-1">
        <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Gestão de Tenants
        </p>

        {/* Link para Listagem */}
        <NavLink 
          to="/dashboard" 
          className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}
        >
          <BuildingOfficeIcon className="h-5 w-5" />
          Empresas
        </NavLink>

        {/* Link para Criação */}
        <NavLink 
          to="/companies/new" 
          className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}
        >
          <PlusCircleIcon className="h-5 w-5" />
          Nova Empresa
        </NavLink>
      </nav>

      {/* Rodapé / Logout */}
      <div className="p-4 border-t border-gray-800 bg-[#0f1523]">
        <button 
          onClick={() => authService.logout()} 
          className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-red-900/30 text-red-400 rounded-lg hover:bg-red-600 hover:text-white transition-all text-sm font-semibold"
        >
          <ArrowLeftOnRectangleIcon className="h-5 w-5" />
          Sair do Sistema
        </button>
      </div>
    </aside>
  );
};
