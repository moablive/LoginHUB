import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BuildingOfficeIcon,
  UsersIcon,
  PlusIcon,
  ArrowRightOnRectangleIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon
} from '@heroicons/react/24/outline';

import { appApi } from '@loginhub/api-client';
import { authApi } from '@loginhub/api-client';
import { masks } from '../utils/masks';
import type { App } from '@loginhub/schema';

// Componentes Shared
import { LogoutModal } from '../components/modals/LogoutModal/LogoutModal';
import { DeleteModal } from '../components/modals/DeleteModal/DeleteModal';
import { StatusButton } from '../components/modals/StatusButton';
import { EditAppModal } from '../components/modals/EditModals/EditAppModal';
import { AlertModal } from '../components/modals/AlertModal/AlertModal';

export const Dashboard = () => {
  const navigate = useNavigate();
  
  // Estados
  const [apps, setApps] = useState<App[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados de Modais e Ações
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  
  const [appToDelete, setAppToDelete] = useState<{ id: string, nome: string } | null>(null);
  const [appToEdit, setAppToEdit] = useState<App | null>(null);
  const [alertState, setAlertState] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: '',
  });

  const showError = (title: string, message: string) => setAlertState({ isOpen: true, title, message });

  // Busca dados iniciais
  const fetchApps = async () => {
    try {
      const data = await appApi.getAll();
      setApps(data);
    } catch (error) {
      console.error('Erro ao buscar aplicativos', error);
      // Aqui você poderia adicionar um Toast de erro
    }
  };

  useEffect(() => {
    fetchApps();
  }, []);

  // Filtro (Memoizado para performance)
  const filteredApps = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return apps.filter(c => 
      c.nome.toLowerCase().includes(term) || 
      c.email.toLowerCase().includes(term) ||
      c.documento.includes(term)
    );
  }, [apps, searchTerm]);

  // --- AÇÕES ---

  const handleLogout = () => {
    authApi.logout();
  };

  // --- Lógica de Exclusão ---
  const handleDeleteClick = (app: App) => {
    setAppToDelete({ id: app.id, nome: app.nome });
  };

  const confirmDelete = async () => {
    if (!appToDelete) return;

    try {
      setLoadingAction(appToDelete.id);
      await appApi.delete(appToDelete.id);
      
      // Atualiza lista localmente para evitar refetch desnecessário
      setApps(prev => prev.filter(c => c.id !== appToDelete.id));
      setAppToDelete(null);
    } catch (error) {
      console.error(error);
      showError('Erro', 'Não foi possível excluir o aplicativo.');
    } finally {
      setLoadingAction(null);
    }
  };

  // --- Lógica de Status ---
  const handleStatusChange = async (app: App) => {
    // Optimistic UI: Calcula o novo status antes de enviar
    const novoStatus = app.status === 'ativo' ? 'inativo' : 'ativo';

    try {
      await appApi.toggleStatus(app.id, novoStatus);

      setApps(prev => prev.map(c => 
        c.id === app.id ? { ...c, status: novoStatus } : c
      ));

    } catch (error) {
      console.error(error);
      showError('Erro', 'Não foi possível atualizar o status do aplicativo.');
    }
  };

  const activeApps = apps.filter(c => c.status === 'ativo').length;

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-dracula-cur p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-dracula-comment">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-dracula-fg tracking-tight">LoginHub <span className="text-blue-600 dark:text-dracula-cyan">Manager</span></h1>
          <p className="text-lg text-gray-500 dark:text-dracula-cyan mt-1">Gestão Centralizada de Aplicativos e Infraestrutura</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowLogoutModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-dracula-cur border border-red-200 dark:border-dracula-red text-red-600 dark:text-dracula-red rounded-xl hover:bg-red-50 dark:bg-[#ff555520] dark:border-[#ff555550] hover:border-red-300 transition font-medium shadow-sm"
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5" />
            Sair
          </button>
          <button 
            onClick={() => navigate('/apps/new')}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 dark:bg-dracula-purple text-white rounded-xl hover:bg-blue-700 dark:hover:bg-dracula-pink transition font-medium shadow-lg shadow-blue-500/30"
          >
            <PlusIcon className="h-5 w-5" />
            Novo Aplicativo
          </button>
        </div>
      </div>

      {/* CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-dracula-cur p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-dracula-comment flex items-center gap-5 transition hover:shadow-md">
          <div className="p-4 bg-blue-50 dark:bg-dracula-comment rounded-xl">
            <BuildingOfficeIcon className="h-8 w-8 text-blue-600 dark:text-dracula-cyan" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-dracula-cyan uppercase tracking-wide">Aplicativos Ativos</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-dracula-fg">{activeApps}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-dracula-cur p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-dracula-comment flex items-center gap-5 transition hover:shadow-md">
          <div className="p-4 bg-purple-50 dark:bg-dracula-comment rounded-xl">
            <UsersIcon className="h-8 w-8 text-purple-600 dark:text-dracula-purple" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-dracula-cyan uppercase tracking-wide">Total Cadastrado</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-dracula-fg">{apps.length}</p>
          </div>
        </div>
      </div>

      {/* TABELA */}
      <div className="bg-white dark:bg-dracula-cur rounded-2xl shadow-sm border border-gray-200 dark:border-dracula-comment overflow-hidden">
        
        {/* Toolbar */}
        <div className="p-6 border-b border-gray-200 dark:border-dracula-comment flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50 dark:bg-dracula-bg/50">
          <h2 className="text-xl font-bold text-gray-800 dark:text-dracula-fg flex items-center gap-2">
            Aplicativos Cadastrados
            <span className="bg-gray-200 dark:bg-dracula-comment text-gray-600 dark:text-dracula-cyan text-xs px-2 py-1 rounded-full">{filteredApps.length}</span>
          </h2>
          
          <div className="relative w-full sm:w-80">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 dark:text-dracula-comment" />
            </div>
            <input 
              type="text" 
              placeholder="Buscar por nome, email ou CNPJ..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-dracula-cur dark:text-dracula-fg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 dark:bg-dracula-bg">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 dark:text-dracula-cyan uppercase tracking-wider">Aplicativo</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 dark:text-dracula-cyan uppercase tracking-wider">Documento</th>
                <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 dark:text-dracula-cyan uppercase tracking-wider">Usuários</th>
                <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 dark:text-dracula-cyan uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 dark:text-dracula-cyan uppercase tracking-wider">Cadastro</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 dark:text-dracula-cyan uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-dracula-cur divide-y divide-gray-200">
              {filteredApps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-dracula-cyan">
                    <div className="flex flex-col items-center justify-center">
                      <MagnifyingGlassIcon className="h-12 w-12 text-gray-300 mb-2" />
                      <p className="text-lg font-medium">Nenhum resultado encontrado.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredApps.map((app) => (
                  <tr key={app.id} className="hover:bg-gray-50 dark:bg-dracula-bg dark:hover:bg-dracula-cur transition duration-150 group">
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex items-center">
                        {app.logo ? (
                          <img
                            src={app.logo}
                            alt={app.nome}
                            className="h-12 w-12 rounded-xl object-contain bg-white dark:bg-dracula-cur border border-gray-200 dark:border-dracula-comment shadow-sm p-1"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                            {app.nome.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="ml-4">
                          <div className="text-base font-semibold text-gray-900 dark:text-dracula-fg group-hover:text-blue-700 transition-colors">
                            {app.nome}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-dracula-cyan">{app.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-600 dark:text-dracula-cyan font-mono">
                      {masks.cnpj(app.documento)}
                    </td>

                    <td className="px-6 py-5 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        (app.total_usuarios || 0) > 0 
                          ? 'bg-blue-100 dark:bg-dracula-comment text-blue-800'
                          : 'bg-gray-100 text-gray-800 dark:text-dracula-fg'
                      }`}>
                        <UsersIcon className="h-3 w-3 mr-1" />
                        {app.total_usuarios || 0}
                      </span>
                    </td>
                    
                    <td className="px-6 py-5 whitespace-nowrap text-center flex justify-center">
                      <StatusButton 
                        currentStatus={app.status as 'ativo' | 'inativo'}
                        entityName={app.nome}
                        onStatusChange={() => handleStatusChange(app)}
                      />
                    </td>

                    <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-500 dark:text-dracula-cyan">
                      {app.data_cadastro ? (
                        new Date(app.data_cadastro).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>

                    <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => navigate(`/apps/${app.id}/users`)}
                          className="px-3 py-1.5 text-blue-600 dark:text-dracula-cyan bg-blue-50 dark:bg-dracula-comment rounded-lg hover:bg-blue-100 dark:bg-dracula-comment transition font-semibold text-xs border border-blue-100"
                        >
                          Usuários
                        </button>

                        <button 
                          onClick={() => setAppToEdit(app)}
                          className="p-2 text-gray-400 dark:text-dracula-comment hover:text-blue-600 dark:text-dracula-cyan hover:bg-blue-50 dark:bg-dracula-comment rounded-lg transition border border-transparent hover:border-blue-100"
                          title="Editar Dados da Aplicativo"
                        >
                          <PencilSquareIcon className="h-5 w-5" />
                        </button>

                        <button 
                          onClick={() => handleDeleteClick(app)}
                          className="p-2 text-gray-400 dark:text-dracula-comment hover:text-red-600 dark:text-dracula-red hover:bg-red-50 dark:bg-[#ff555520] dark:border-[#ff555550] rounded-lg transition border border-transparent hover:border-red-100"
                          title="Excluir Aplicativo"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAIS */}
      <LogoutModal 
        isOpen={showLogoutModal} 
        onClose={() => setShowLogoutModal(false)} 
        onConfirm={handleLogout} 
      />

      <DeleteModal
        isOpen={!!appToDelete}
        onClose={() => setAppToDelete(null)}
        onConfirm={confirmDelete}
        title="Excluir Aplicativo"
        itemName={appToDelete?.nome}
        isLoading={loadingAction === appToDelete?.id}
      />

      <EditAppModal
        isOpen={!!appToEdit}
        onClose={() => setAppToEdit(null)}
        app={appToEdit}
        onSuccess={() => {
          setAppToEdit(null); // Fecha o modal
          fetchApps(); // Recarrega os dados
        }}
      />

      <AlertModal
        isOpen={alertState.isOpen}
        onClose={() => setAlertState(prev => ({ ...prev, isOpen: false }))}
        title={alertState.title}
        message={alertState.message}
        variant="error"
      />

    </div>
  );
};