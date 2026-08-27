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
  LockOpenIcon,
  DevicePhoneMobileIcon,
  ShieldExclamationIcon,
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
import { IntegrationLink } from '../components/Integration/IntegrationLink';
import { AppLinkPanel } from '../components/Integration/AppLinkPanel';
import { getAppIntegration } from '../config/integrations';
import { getAppLinks } from '../config/appLinks';

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

  // --- RESET 2FA ---
  // Caminho de quem perdeu o celular E os códigos de recuperação. Não isenta
  // do 2FA: descarta o autenticador e a conta reenrola no próximo login.
  const handleResetTwoFactor = async (user: User) => {
    try {
      await userApi.resetTwoFactor(user.id);
      await fetchData();
      showAlert(
        '2FA reiniciado',
        `${user.email} vai configurar um autenticador novo no próximo login. As sessões abertas foram encerradas.`,
        'info',
      );
    } catch (error: unknown) {
      console.error(error);
      showAlert('Erro', 'Não foi possível reiniciar o 2FA deste usuário.', 'error');
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
        const loginUrlBase = (app?.platform_url || window.location.origin).replace(/\/+$/, '');
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
            className="flex items-center text-sm text-muted-foreground hover:text-primary mb-2 transition"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Voltar para Aplicativos
          </button>
          
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
               <UsersIcon className="h-6 w-6 text-primary" />
            </div>
            Gestão de Usuários
          </h1>
          <p className="text-muted-foreground mt-1 ml-1">
            Aplicativo: <span className="font-semibold text-foreground">{app?.nome || 'Carregando...'}</span>
          </p>
        </div>
        
        <button 
          onClick={() => setShowFormModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-success text-primary-foreground rounded-lg hover:bg-success/90 transition shadow-md text-sm font-medium"
        >
          <UserPlusIcon className="h-5 w-5" />
          Convidar Usuário
        </button>
      </div>

      {/* Apps que só recebem convite (usa_login_hub = false) não autenticam
          aqui — o Cofre é o caso. Sem este aviso, a coluna "2FA" da tabela
          abaixo sugere que o segundo fator protege o app, e não protege: a
          pessoa nunca passa pelo login do hub, então nunca enrola. */}
      {app && app.usaLoginHub === false && (
        <div className="max-w-7xl mx-auto mb-4">
          <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
            <p className="text-sm font-semibold text-warning flex items-center gap-2">
              <ShieldExclamationIcon className="h-5 w-5 shrink-0" />
              O 2FA do LoginHUB não vale para este aplicativo
            </p>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              Aqui o hub <strong>só emite o convite</strong>. Quem entra em{' '}
              <span className="font-medium text-foreground">{app?.nome}</span> não passa
              pelo login do LoginHUB, então nunca chega a configurar o segundo fator —
              por isso ele fica desligado por padrão nestas contas, em vez de mostrar um
              &ldquo;pendente&rdquo; que nunca resolve.
            </p>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              A senha destas contas <strong>não abre nada aqui</strong>: o login do hub é
              recusado para elas. A proteção do app é a senha mestra que a pessoa define
              no próprio {app?.nome} — o hub não a conhece e não consegue recuperá-la.
            </p>
          </div>
        </div>
      )}

      {/* Vínculo com a API do próprio app, quando existe. Aqui o convite pode não
          nascer no hub: quem cria o usuário é o backend do app. */}
      {getAppIntegration(appId) && (
        <div className="max-w-7xl mx-auto -mt-2">
          <IntegrationLink appId={appId} appName={app?.nome} />
        </div>
      )}

      {/* Vínculo com OUTRO app cliente. Aqui na tela do convite porque é onde a
          confusão nasce: convidar não liga a pessoa ao outro app. */}
      {getAppLinks(appId).length > 0 && (
        <div className="max-w-7xl mx-auto -mt-2">
          <AppLinkPanel appId={appId} />
        </div>
      )}

      {/* TABELA */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-card text-card-foreground rounded-xl shadow-sm border border-border overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Sincronizando dados...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Nome</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Acesso</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Contato</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">2FA</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="bg-card text-card-foreground divide-y divide-gray-200">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center">
                          <UserIcon className="h-10 w-10 text-muted-foreground opacity-50 mb-2" />
                          <span>Nenhum usuário vinculado a esta aplicativo.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.id} className="hover:bg-muted/50 transition">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 bg-muted rounded-full flex items-center justify-center">
                              <span className="font-bold text-muted-foreground text-sm">{user.nome.charAt(0).toUpperCase()}</span>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-foreground">{user.nome}</div>
                              <div className="text-sm text-muted-foreground">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {user.role === 'admin' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                              <ShieldCheckIcon className="h-3 w-3 mr-1" />
                              Admin
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground border border-border">
                              Usuário
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          {user.telefone || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {user.status === 'ativo' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/20 text-success border border-success/30">
                              Ativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-danger/20 text-danger border border-danger/30">
                              Bloqueado
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {app?.usaLoginHub === false ? (
                            // "Pendente" seria falso aqui: não há login no hub
                            // para cair no enrolamento. Dizer "não se aplica" é
                            // o estado verdadeiro.
                            <span
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border"
                              title="Este app não autentica pelo LoginHUB — o hub só emitiu o convite."
                            >
                              não se aplica
                            </span>
                          ) : user.dois_fatores?.ativo ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/20 text-success border border-success/30">
                              <DevicePhoneMobileIcon className="h-3 w-3 mr-1" />
                              Ativo
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning/20 text-warning border border-warning/30"
                              title="Exigido, mas ainda não configurado. A conta cai no enrolamento no próximo login."
                            >
                              Pendente
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end gap-2">
                            {user.dois_fatores?.ativo && (
                              <button
                                onClick={() => void handleResetTwoFactor(user)}
                                className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition"
                                title="Reiniciar 2FA (perdeu o celular)"
                              >
                                <DevicePhoneMobileIcon className="h-5 w-5" />
                              </button>
                            )}

                            <button
                              onClick={() => handleResetPasswordClick(user)}
                              disabled={isResetting === user.id}
                              className="p-2 text-muted-foreground hover:text-amber-500 dark:hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition disabled:opacity-50"
                              title="Resetar Senha"
                            >
                              <KeyIcon className="h-5 w-5" />
                            </button>

                            <button
                              onClick={() => handleToggleStatus(user)}
                              className={`p-2 rounded-lg transition ${
                                user.status === 'ativo' 
                                  ? 'text-muted-foreground hover:text-danger hover:bg-danger/10' 
                                  : 'text-muted-foreground hover:text-success hover:bg-success/10'
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
                              className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition"
                              title="Editar Usuário"
                            >
                              <PencilSquareIcon className="h-5 w-5" />
                            </button>

                            <button 
                              onClick={() => handleDeleteClick(user)}
                              className="p-2 text-muted-foreground hover:text-danger hover:bg-danger/10 rounded-lg transition"
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
            const loginUrlBase = (app?.platform_url || window.location.origin).replace(/\/+$/, '');
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
            <div className="relative transform overflow-hidden rounded-2xl bg-card text-card-foreground text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-border">
              <div className="bg-muted/50 px-4 py-3 sm:px-6 border-b border-border flex justify-between items-center">
                <h3 className="text-lg font-semibold leading-6 text-foreground flex items-center gap-2">
                  <KeyIcon className="h-5 w-5 text-amber-500" />
                  {credentialsAlert.title}
                </h3>
                <button
                  type="button"
                  className="rounded-md bg-transparent text-muted-foreground hover:text-muted-foreground"
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
                    className="w-full text-sm text-gray-700 bg-muted/50 border border-border rounded-lg p-3 font-mono resize-none focus:outline-none"
                  />
                  <button 
                    onClick={() => navigator.clipboard.writeText(credentialsAlert.message)}
                    className="absolute top-2 right-2 bg-card text-card-foreground border border-border shadow-sm p-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted/50"
                  >
                    Copiar
                  </button>
                </div>
                <p className="mt-3 text-sm text-muted-foreground flex items-center gap-1.5 bg-primary/10 text-primary p-2 rounded-md border border-blue-100">
                  ⚠️ Guarde esta senha. Ela não poderá ser visualizada novamente.
                </p>
              </div>
              <div className="bg-muted/50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                <button
                  type="button"
                  className="inline-flex w-full justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 sm:w-auto"
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