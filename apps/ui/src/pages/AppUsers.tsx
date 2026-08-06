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
  PencilSquareIcon,
  KeyIcon,
  XMarkIcon,
  LockClosedIcon,
  LockOpenIcon
} from '@heroicons/react/24/outline';

import { userApi } from '@loginhub/api-client';
import { appApi } from '@loginhub/api-client';
import type { User, App } from '@loginhub/schema';
import ReactDOMServer from 'react-dom/server';
import { ResetPasswordEmail } from '../templates/emails';

import { SuccessModal } from '../components/modals/SuccessModal/SuccessModal';
import { DeleteModal } from '../components/modals/DeleteModal/DeleteModal';
import { CreateUserModal } from '../components/modals/CreateUserModal/CreateUserModal';
import { AlertModal } from '../components/modals/AlertModal/AlertModal';
import { EditUserModal } from '../components/modals/EditModals/EditUserModal';
import { ConfirmModal } from '../components/modals/ConfirmModal/ConfirmModal';

export const AppUsers = () => {
  const { id: appId } = useParams<{ id: string }>(); 
  const navigate = useNavigate();
  
  // Estados de Dados
  const [users, setUsers] = useState<User[]>([]);
  const [app, setApp] = useState<App | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Estados de Modais
  const [showFormModal, setShowFormModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  
  // Estados de Ação
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const [userToReset, setUserToReset] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResetting, setIsResetting] = useState<string | null>(null);

  // Modal de Credenciais
  const [credentialsAlert, setCredentialsAlert] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({ isOpen: false, title: '', message: '' });

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
    if (!appId) return;
    try {
      const [usersData, appData] = await Promise.all([
        userApi.getByAppId(appId),
        appApi.getById(appId)
      ]);
      
      setUsers(usersData);
      setApp(appData);
    } catch (error) {
      console.error(error);
      showAlert('Erro de Conexão', 'Não foi possível carregar os dados da aplicativo.', 'error');
    } finally {
      setLoading(false);
    }
  }, [appId]);

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
      await userApi.delete(userToDelete.id);
      
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

  // --- TOGGLE STATUS ---
  const handleToggleStatus = async (user: User) => {
    try {
      const newStatus = user.status === 'ativo' ? 'bloqueado' : 'ativo';
      await userApi.toggleStatus(user.id, newStatus);
      
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: newStatus } : u));
      
      showAlert(
        'Status Atualizado',
        `O usuário ${user.nome} foi ${newStatus === 'ativo' ? 'desbloqueado' : 'bloqueado'} com sucesso.`,
        'info'
      );
    } catch (error) {
      console.error('Erro ao alterar status:', error);
      showAlert('Erro', 'Não foi possível alterar o status do usuário.', 'error');
    }
  };

  // --- RESET PASSWORD ---
  const handleResetPasswordClick = (user: User) => {
    setUserToReset(user);
  };

  const handleConfirmResetPassword = async () => {
    if (!userToReset) return;
    const user = userToReset;

    try {
      setIsResetting(user.id);

      const emailHtml = ReactDOMServer.renderToStaticMarkup(
        <ResetPasswordEmail
          email={user.email}
          appName={app?.nome || 'nossa plataforma'}
          loginUrl={app?.platform_url || undefined}
          magicLinkToken={'__MAGIC_LINK__'}
          appLogo={app?.logo}
        />
      );

      const res = await userApi.resetPassword(user.id, emailHtml);

      setUserToReset(null);

      if (res.emailSent) {
        showAlert(
          'Acesso Redefinido',
          `Um link para definição de senha foi enviado por e-mail para ${user.email}.`,
          'info',
        );
      } else if (res.magicLinkToken) {
        const loginUrlBase = app?.platform_url || window.location.origin;
        setCredentialsAlert({
          isOpen: true,
          title: 'Acesso Redefinido (envio falhou)',
          message: `O e-mail não pôde ser enviado. Repasse o link manualmente:\n\nLink: ${loginUrlBase}/setup-password?token=${res.magicLinkToken}`,
        });
      } else {
        showAlert('Acesso Redefinido', 'Link de redefinição gerado com sucesso.', 'info');
      }
    } catch (error: unknown) {
      console.error(error);
      setUserToReset(null);
      showAlert('Erro', 'Não foi possível resetar a senha deste usuário.', 'error');
    } finally {
      setIsResetting(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* HEADER DA PÁGINA */}
      <div className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <button 
            onClick={() => navigate('/dashboard')} 
            className="flex items-center text-sm text-gray-500 hover:text-blue-600 mb-2 transition"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Voltar para Aplicativos
          </button>
          
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <div className="p-2 bg-blue-50 rounded-lg">
               <UsersIcon className="h-6 w-6 text-blue-600" />
            </div>
            Gestão de Usuários
          </h1>
          <p className="text-gray-500 mt-1 ml-1">
            Aplicativo: <span className="font-semibold text-gray-800">{app?.nome || 'Carregando...'}</span>
          </p>
        </div>
        
        <button 
          onClick={() => setShowFormModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition shadow-md text-sm font-medium"
        >
          <UserPlusIcon className="h-5 w-5" />
          Convidar Usuário
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center justify-center">
                          <UserIcon className="h-10 w-10 text-gray-300 mb-2" />
                          <span>Nenhum usuário vinculado a esta aplicativo.</span>
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
                        <td className="px-6 py-4 whitespace-nowrap">
                          {user.status === 'ativo' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                              Ativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                              Bloqueado
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleResetPasswordClick(user)}
                              disabled={isResetting === user.id}
                              className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition disabled:opacity-50"
                              title="Resetar Senha"
                            >
                              <KeyIcon className="h-5 w-5" />
                            </button>

                            <button
                              onClick={() => handleToggleStatus(user)}
                              className={`p-2 rounded-lg transition ${
                                user.status === 'ativo' 
                                  ? 'text-gray-400 hover:text-red-600 hover:bg-red-50' 
                                  : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                              }`}
                              title={user.status === 'ativo' ? 'Bloquear Usuário' : 'Desbloquear Usuário'}
                            >
                              {user.status === 'ativo' ? (
                                <LockOpenIcon className="h-5 w-5" />
                              ) : (
                                <LockClosedIcon className="h-5 w-5" />
                              )}
                            </button>

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
        appId={appId!}
        appName={app?.nome}
        appBotUrl={app?.bot_url}
        appPlatformUrl={app?.platform_url}
        appLogo={app?.logo}
        onSuccess={({ email, emailSent, magicLinkToken }) => {
          fetchData();
          setShowFormModal(false);
          if (emailSent) {
            showAlert('Convite Enviado', `O convite foi enviado por e-mail para ${email}.`, 'info');
          } else if (magicLinkToken) {
            const loginUrlBase = app?.platform_url || window.location.origin;
            setCredentialsAlert({
              isOpen: true,
              title: 'Convite Gerado (envio falhou)',
              message: `O e-mail não pôde ser enviado. Repasse o link manualmente:\n\nLink: ${loginUrlBase}/setup-password?token=${magicLinkToken}`,
            });
          } else {
            setShowSuccessModal(true);
          }
        }}
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

      {/* MODAL DE RESET DE SENHA */}
      <ConfirmModal
        isOpen={!!userToReset}
        onClose={() => setUserToReset(null)}
        onConfirm={handleConfirmResetPassword}
        title="Resetar senha do usuário"
        variant="warning"
        icon={<KeyIcon className="h-6 w-6" />}
        message={
          <>
            Um link de acesso será gerado e enviado por e-mail para o usuário.
            Através deste link, ele deverá definir uma nova senha definitiva.
          </>
        }
        highlight={userToReset ? `${userToReset.nome} — ${userToReset.email}` : undefined}
        confirmText="Gerar novo link"
        loadingText="Gerando..."
        isLoading={isResetting === userToReset?.id}
      />

      {/* MODAL DE ALERTAS GERAIS */}
      <AlertModal 
        isOpen={alertState.isOpen}
        onClose={closeAlert}
        title={alertState.title}
        message={alertState.message}
        variant={alertState.variant}
      />

      {/* ALERT DE CREDENCIAIS (Como no MoneyApp) */}
      {credentialsAlert.isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-0">
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity" onClick={() => setCredentialsAlert({ ...credentialsAlert, isOpen: false })} aria-hidden="true" />
            <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-gray-200">
              <div className="bg-gray-50 px-4 py-3 sm:px-6 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-lg font-semibold leading-6 text-gray-900 flex items-center gap-2">
                  <KeyIcon className="h-5 w-5 text-amber-500" />
                  {credentialsAlert.title}
                </h3>
                <button
                  type="button"
                  className="rounded-md bg-transparent text-gray-400 hover:text-gray-500"
                  onClick={() => setCredentialsAlert({ ...credentialsAlert, isOpen: false })}
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              <div className="px-4 py-5 sm:p-6">
                <div className="mt-2 relative">
                  <textarea
                    readOnly
                    value={credentialsAlert.message}
                    rows={7}
                    className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 font-mono resize-none focus:outline-none"
                  />
                  <button 
                    onClick={() => navigator.clipboard.writeText(credentialsAlert.message)}
                    className="absolute top-2 right-2 bg-white border border-gray-200 shadow-sm p-1.5 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Copiar
                  </button>
                </div>
                <p className="mt-3 text-sm text-gray-500 flex items-center gap-1.5 bg-blue-50 text-blue-700 p-2 rounded-md border border-blue-100">
                  ⚠️ Guarde esta senha. Ela não poderá ser visualizada novamente.
                </p>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                <button
                  type="button"
                  className="inline-flex w-full justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 sm:w-auto"
                  onClick={() => setCredentialsAlert({ ...credentialsAlert, isOpen: false })}
                >
                  Entendi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};