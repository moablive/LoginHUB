import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  UserPlusIcon, 
  ArrowLeftIcon, 
  UsersIcon, 
  TrashIcon,
  ShieldCheckIcon,
  UserIcon,
  PencilSquareIcon
} from '@heroicons/react/24/outline';

import { userService } from '../services/userService';
import { companyService } from '../services/companyService';
import type { User, Company } from '@loginhub/shared';

import { SuccessModal } from '../components/shared/SuccessModal/SuccessModal';
import { DeleteModal } from '../components/shared/DeleteModal/DeleteModal';
import { CreateUserModal } from '../components/shared/CreateUserModal/CreateUserModal';
import { AlertModal } from '../components/shared/AlertModal/AlertModal';
import { EditUserModal } from '../components/shared/EditModals/EditUserModal';

export const CompanyUsers = () => {
  const { id: empresaId } = useParams<{ id: string }>(); 
  const navigate = useNavigate();
  
  // Estados de Dados
  const [users, setUsers] = useState<User[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Estados de Modais
  const [showFormModal, setShowFormModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  
  // Estados de Ação
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Estado de Alerta
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'error' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'error'
  });

  const showAlert = (title: string, message: string, variant: 'error' | 'warning' | 'info' = 'error') => {
    setAlertState({ isOpen: true, title, message, variant });
  };

  const closeAlert = () => {
    setAlertState(prev => ({ ...prev, isOpen: false }));
  };

  // --- CARREGAMENTO ---
  const fetchData = useCallback(async () => {
    if (!empresaId) return;
    try {
      const [usersData, companyData] = await Promise.all([
        userService.getByCompanyId(empresaId),
        companyService.getById(empresaId)
      ]);
      
      setUsers(usersData);
      setCompany(companyData);
    } catch (error) {
      console.error(error);
      showAlert('Erro de Conexão', 'Não foi possível carregar os dados da empresa.', 'error');
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- DELETE ---
  const handleDeleteClick = (user: User) => {
    setUserToDelete(user);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;

    try {
      setIsDeleting(true);
      await userService.delete(userToDelete.id);
      
      setUsers(prev => prev.filter(u => u.id !== userToDelete.id));
      setUserToDelete(null);
      showAlert('Sucesso', 'Usuário removido com sucesso.', 'info');
      
    } catch (error: unknown) {
      console.error(error);
      
      if (axios.isAxiosError(error)) {
        const msg = error.response?.data?.message || 'Não foi possível excluir o usuário.';
        showAlert('Erro ao Excluir', msg, 'error');
      } else {
        showAlert('Erro Inesperado', 'Ocorreu um erro ao tentar excluir o usuário.', 'error');
      }

    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 animate-fade-in pb-20">
      
      {/* HEADER */}
      <div className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <button 
            onClick={() => navigate('/dashboard')} 
            className="flex items-center text-sm text-gray-500 hover:text-blue-600 mb-2 transition"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Voltar para Empresas
          </button>
          
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <div className="p-2 bg-blue-50 rounded-lg">
               <UsersIcon className="h-6 w-6 text-blue-600" />
            </div>
            Gestão de Usuários
          </h1>
          <p className="text-gray-500 mt-1 ml-1">
            Empresa: <span className="font-semibold text-gray-800">{company?.nome || 'Carregando...'}</span>
          </p>
        </div>
        
        <button 
          onClick={() => setShowFormModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition shadow-md text-sm font-medium"
        >
          <UserPlusIcon className="h-5 w-5" />
          Novo Usuário
        </button>
      </div>

      {/* TABELA */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-500">Sincronizando dados...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acesso</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contato</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center justify-center">
                          <UserIcon className="h-10 w-10 text-gray-300 mb-2" />
                          <span>Nenhum usuário vinculado a esta empresa.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50 transition">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center">
                              <span className="font-bold text-gray-500 text-sm">{user.nome.charAt(0).toUpperCase()}</span>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{user.nome}</div>
                              <div className="text-sm text-gray-500">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {user.role === 'admin' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                              <ShieldCheckIcon className="h-3 w-3 mr-1" />
                              Admin
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                              Usuário
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {user.telefone || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => setUserToEdit(user)}
                              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                              title="Editar Usuário"
                            >
                              <PencilSquareIcon className="h-5 w-5" />
                            </button>

                            <button 
                              onClick={() => handleDeleteClick(user)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                              title="Remover Usuário"
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
          )}
        </div>
      </div>

      {/* MODAL DE CRIAÇÃO */}
      <CreateUserModal
        isOpen={showFormModal}
        onClose={() => setShowFormModal(false)}
        onSuccess={() => {
          fetchData();
          setShowSuccessModal(true);
        }}
        companyId={empresaId || ''}
      />

      {/* MODAL DE EDIÇÃO */}
      <EditUserModal
        isOpen={!!userToEdit}
        onClose={() => setUserToEdit(null)}
        user={userToEdit}
        onSuccess={() => {
          fetchData();
          showAlert('Sucesso', 'Dados do usuário atualizados com sucesso.', 'info');
        }}
      />

      {/* MODAL DE SUCESSO (Criação) */}
      <SuccessModal 
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        title="Usuário Criado"
        message="O usuário foi adicionado com sucesso e já pode acessar o sistema."
        buttonText="Continuar"
      />

      {/* MODAL DE DELETE */}
      <DeleteModal 
        isOpen={!!userToDelete}
        onClose={() => setUserToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Remover Usuário"
        itemName={userToDelete?.nome}
        isLoading={isDeleting}
      />

      {/* MODAL DE ALERTAS GERAIS */}
      <AlertModal 
        isOpen={alertState.isOpen}
        onClose={closeAlert}
        title={alertState.title}
        message={alertState.message}
        variant={alertState.variant}
      />

    </div>
  );
};