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

import { companyService } from '../services/companyService';
import { authService } from '../services/authService';
import { masks } from '../utils/masks';
import type { Company } from '@loginhub/shared';

// Componentes Shared
import { LogoutModal } from '../components/shared/LogoutModal/LogoutModal';
import { DeleteModal } from '../components/shared/DeleteModal/DeleteModal';
import { StatusButton } from '../components/shared/StatusButton';
import { EditCompanyModal } from '../components/shared/EditModals/EditCompanyModal'; 

export const Dashboard = () => {
  const navigate = useNavigate();
  
  // Estados
  const [companies, setCompanies] = useState<Company[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados de Modais e Ações
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  
  const [companyToDelete, setCompanyToDelete] = useState<{ id: string, nome: string } | null>(null);
  const [companyToEdit, setCompanyToEdit] = useState<Company | null>(null);

  // Busca dados iniciais
  const fetchCompanies = async () => {
    try {
      const data = await companyService.getAll();
      setCompanies(data);
    } catch (error) {
      console.error('Erro ao buscar empresas', error);
      // Aqui você poderia adicionar um Toast de erro
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  // Filtro (Memoizado para performance)
  const filteredCompanies = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return companies.filter(c => 
      c.nome.toLowerCase().includes(term) || 
      c.email.toLowerCase().includes(term) ||
      c.documento.includes(term)
    );
  }, [companies, searchTerm]);

  // --- AÇÕES ---

  const handleLogout = () => {
    authService.logout();
  };

  // --- Lógica de Exclusão ---
  const handleDeleteClick = (company: Company) => {
    setCompanyToDelete({ id: company.id, nome: company.nome });
  };

  const confirmDelete = async () => {
    if (!companyToDelete) return;

    try {
      setLoadingAction(companyToDelete.id);
      await companyService.delete(companyToDelete.id);
      
      // Atualiza lista localmente para evitar refetch desnecessário
      setCompanies(prev => prev.filter(c => c.id !== companyToDelete.id));
      setCompanyToDelete(null);
    } catch (error) {
      console.error(error);
      alert('Erro ao excluir empresa.');
    } finally {
      setLoadingAction(null);
    }
  };

  // --- Lógica de Status ---
  const handleStatusChange = async (company: Company) => {
    // Optimistic UI: Calcula o novo status antes de enviar
    const novoStatus = company.status === 'ativo' ? 'inativo' : 'ativo';

    try {
      await companyService.toggleStatus(company.id, novoStatus);

      setCompanies(prev => prev.map(c => 
        c.id === company.id ? { ...c, status: novoStatus } : c
      ));

    } catch (error) {
      console.error(error);
      alert('Erro ao atualizar status.');
    }
  };

  const activeCompanies = companies.filter(c => c.status === 'ativo').length;

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">LoginHub <span className="text-blue-600">Manager</span></h1>
          <p className="text-lg text-gray-500 mt-1">Gestão Centralizada de Tenants e Infraestrutura</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowLogoutModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-red-200 text-red-600 rounded-xl hover:bg-red-50 hover:border-red-300 transition font-medium shadow-sm"
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5" />
            Sair
          </button>
          <button 
            onClick={() => navigate('/companies/new')}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-medium shadow-lg shadow-blue-500/30"
          >
            <PlusIcon className="h-5 w-5" />
            Nova Empresa
          </button>
        </div>
      </div>

      {/* CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-5 transition hover:shadow-md">
          <div className="p-4 bg-blue-50 rounded-xl">
            <BuildingOfficeIcon className="h-8 w-8 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Empresas Ativas</p>
            <p className="text-3xl font-bold text-gray-900">{activeCompanies}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-5 transition hover:shadow-md">
          <div className="p-4 bg-purple-50 rounded-xl">
            <UsersIcon className="h-8 w-8 text-purple-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Total Cadastrado</p>
            <p className="text-3xl font-bold text-gray-900">{companies.length}</p> 
          </div>
        </div>
      </div>

      {/* TABELA */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        
        {/* Toolbar */}
        <div className="p-6 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50/50">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            Tenants Cadastrados
            <span className="bg-gray-200 text-gray-600 text-xs px-2 py-1 rounded-full">{filteredCompanies.length}</span>
          </h2>
          
          <div className="relative w-full sm:w-80">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input 
              type="text" 
              placeholder="Buscar por nome, email ou CNPJ..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-sm text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Empresa</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Documento</th>
                <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Usuários</th>
                <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Cadastro</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredCompanies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center">
                      <MagnifyingGlassIcon className="h-12 w-12 text-gray-300 mb-2" />
                      <p className="text-lg font-medium">Nenhum resultado encontrado.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCompanies.map((company) => (
                  <tr key={company.id} className="hover:bg-gray-50 transition duration-150 group">
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                          {company.nome.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="ml-4">
                          <div className="text-base font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                            {company.nome}
                          </div>
                          <div className="text-sm text-gray-500">{company.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-600 font-mono">
                      {masks.cnpj(company.documento)}
                    </td>

                    <td className="px-6 py-5 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        (company.total_usuarios || 0) > 0 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        <UsersIcon className="h-3 w-3 mr-1" />
                        {company.total_usuarios || 0}
                      </span>
                    </td>
                    
                    <td className="px-6 py-5 whitespace-nowrap text-center flex justify-center">
                      <StatusButton 
                        currentStatus={company.status as 'ativo' | 'inativo'}
                        entityName={company.nome}
                        onStatusChange={() => handleStatusChange(company)}
                      />
                    </td>

                    <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-500">
                      {company.data_cadastro ? (
                        new Date(company.data_cadastro).toLocaleDateString('pt-BR', {
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
                        {/* Botão Usuários: Ajustada a rota para o padrão sem /admin */}
                        <button 
                          onClick={() => navigate(`/companies/${company.id}/users`)}
                          className="px-3 py-1.5 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition font-semibold text-xs border border-blue-100"
                        >
                          Usuários
                        </button>

                        <button 
                          onClick={() => setCompanyToEdit(company)}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition border border-transparent hover:border-blue-100"
                          title="Editar Dados da Empresa"
                        >
                          <PencilSquareIcon className="h-5 w-5" />
                        </button>

                        <button 
                          onClick={() => handleDeleteClick(company)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition border border-transparent hover:border-red-100"
                          title="Excluir Empresa"
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
        isOpen={!!companyToDelete}
        onClose={() => setCompanyToDelete(null)}
        onConfirm={confirmDelete}
        title="Excluir Empresa"
        itemName={companyToDelete?.nome}
        isLoading={loadingAction === companyToDelete?.id}
      />

      <EditCompanyModal
        isOpen={!!companyToEdit}
        onClose={() => setCompanyToEdit(null)}
        company={companyToEdit}
        onSuccess={() => {
          setCompanyToEdit(null); // Fecha o modal
          fetchCompanies(); // Recarrega os dados
        }}
      />

    </div>
  );
};