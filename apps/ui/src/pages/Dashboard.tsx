import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BuildingOfficeIcon,
  UsersIcon,
  PlusIcon,
  ArrowRightOnRectangleIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  LinkIcon,
  PuzzlePieceIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  TagIcon
} from '@heroicons/react/24/outline';

import { appApi, categoriaApi } from '@loginhub/api-client';
import { authApi } from '@loginhub/api-client';
import { masks } from '../utils/masks';
import type { App, Categoria, DirecaoMovimento } from '@loginhub/schema';
import { getAppIntegration } from '../config/integrations';
import { getAppLinks } from '../config/appLinks';

// Componentes Shared
import { LogoutModal } from '../components/modals/LogoutModal/LogoutModal';
import { DeleteModal } from '../components/modals/DeleteModal/DeleteModal';
import { StatusButton } from '../components/modals/StatusButton';
import { EditAppModal } from '../components/modals/EditModals/EditAppModal';
import { AlertModal } from '../components/modals/AlertModal/AlertModal';
import { CategoriasModal } from '../components/modals/CategoriasModal/CategoriasModal';
import { IntegrationBadge } from '../components/Integration/IntegrationBadge';
import { AppLinkBadge } from '../components/Integration/AppLinkBadge';

export const Dashboard = () => {
  const navigate = useNavigate();
  
  // Estados
  const [apps, setApps] = useState<App[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados de Modais e Ações
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showCategorias, setShowCategorias] = useState(false);
  // Id do app cuja seta acabou de ser clicada: trava as setas até a lista voltar.
  const [movendo, setMovendo] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  
  const [appToDelete, setAppToDelete] = useState<{ id: string, nome: string } | null>(null);
  const [appToEdit, setAppToEdit] = useState<App | null>(null);
  const [alertState, setAlertState] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: '',
  });

  const showError = (title: string, message: string) => setAlertState({ isOpen: true, title, message });

  // Busca dados iniciais. A API já devolve os apps na ordem do painel
  // (categoria, depois `ordem`); a tela só agrupa, nunca reordena.
  const fetchApps = async () => {
    try {
      const [listaApps, listaCategorias] = await Promise.all([appApi.getAll(), categoriaApi.getAll()]);
      setApps(listaApps);
      setCategorias(listaCategorias);
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

  const buscando = searchTerm.trim().length > 0;

  /**
   * Grupos na ordem das categorias, com "Sem categoria" por último. Categoria
   * vazia aparece (para o usuário ver que existe) — exceto durante uma busca,
   * quando só interessa quem casou com o termo.
   */
  const grupos = useMemo(() => {
    const porCategoria = new Map<number | null, App[]>();
    for (const app of filteredApps) {
      const chave = app.categoria_id ?? null;
      const lista = porCategoria.get(chave) ?? [];
      lista.push(app);
      porCategoria.set(chave, lista);
    }
    const resultado: Array<{ id: number | null; nome: string; apps: App[] }> = [];
    for (const c of categorias) {
      const lista = porCategoria.get(c.id) ?? [];
      if (lista.length > 0 || !buscando) resultado.push({ id: c.id, nome: c.nome, apps: lista });
    }
    const semCategoria = porCategoria.get(null) ?? [];
    if (semCategoria.length > 0 || (!buscando && categorias.length > 0)) {
      resultado.push({ id: null, nome: 'Sem categoria', apps: semCategoria });
    }
    return resultado;
  }, [filteredApps, categorias, buscando]);

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

  // --- Ordem dentro da categoria ---
  // Só troca com o vizinho da MESMA categoria; a API renumera o grupo. Durante
  // uma busca as setas ficam travadas: o vizinho visível pode não ser o real.
  const handleMover = async (app: App, direcao: DirecaoMovimento) => {
    if (movendo || buscando) return;
    setMovendo(app.id);
    try {
      await appApi.mover(app.id, direcao);
      await fetchApps();
    } catch (error) {
      console.error(error);
      showError('Erro', 'Não foi possível mover o aplicativo.');
    } finally {
      setMovendo(null);
    }
  };

  const activeApps = apps.filter(c => c.status === 'ativo').length;
  // Apps que mantêm uma API conversando com o hub (ver config/integrations.ts).
  const integratedApps = apps.filter(c => getAppIntegration(c.id)).length;
  // Apps que aparecem dentro de outro app (ver config/appLinks.ts). Conta
  // aplicativo, não pessoa: o vínculo em si é cadastrado usuário a usuário.
  const linkedApps = apps.filter(c => getAppLinks(c.id).length > 0).length;

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card text-card-foreground p-6 rounded-2xl shadow-sm border border-border">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">LoginHub <span className="text-primary">Manager</span></h1>
          <p className="text-lg text-muted-foreground mt-1">Gestão Centralizada de Aplicativos e Infraestrutura</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowLogoutModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-background border border-danger/20 text-danger rounded-xl hover:bg-danger/10 hover:border-danger/30 transition font-medium shadow-sm"
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5" />
            Sair
          </button>
          <button 
            onClick={() => navigate('/apps/new')}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition font-medium shadow-lg shadow-primary/30"
          >
            <PlusIcon className="h-5 w-5" />
            Novo Aplicativo
          </button>
        </div>
      </div>

      {/* CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-card text-card-foreground p-6 rounded-2xl shadow-sm border border-border flex items-center gap-5 transition hover:shadow-md">
          <div className="p-4 bg-primary/10 rounded-xl">
            <BuildingOfficeIcon className="h-8 w-8 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Aplicativos Ativos</p>
            <p className="text-3xl font-bold text-foreground">{activeApps}</p>
          </div>
        </div>

        <div className="bg-card text-card-foreground p-6 rounded-2xl shadow-sm border border-border flex items-center gap-5 transition hover:shadow-md">
          <div className="p-4 bg-muted rounded-xl">
            <UsersIcon className="h-8 w-8 text-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Total Cadastrado</p>
            <p className="text-3xl font-bold text-foreground">{apps.length}</p>
          </div>
        </div>

        <div className="bg-card text-card-foreground p-6 rounded-2xl shadow-sm border border-border flex items-center gap-5 transition hover:shadow-md">
          <div className="p-4 bg-violet-500/10 rounded-xl">
            <LinkIcon className="h-8 w-8 text-violet-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">APIs Vinculadas</p>
            <p className="text-3xl font-bold text-foreground">{integratedApps}</p>
            <p className="text-xs text-muted-foreground">Apps que falam com o hub por trás</p>
          </div>
        </div>

        <div className="bg-card text-card-foreground p-6 rounded-2xl shadow-sm border border-border flex items-center gap-5 transition hover:shadow-md">
          <div className="p-4 bg-amber-500/10 rounded-xl">
            <PuzzlePieceIcon className="h-8 w-8 text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Apps Integrados</p>
            <p className="text-3xl font-bold text-foreground">{linkedApps}</p>
            <p className="text-xs text-muted-foreground">Apps que mostram dados de outro app, por usuário</p>
          </div>
        </div>
      </div>

      {/* TABELA */}
      <div className="bg-card text-card-foreground rounded-2xl shadow-sm border border-border overflow-hidden">
        
        {/* Toolbar */}
        <div className="p-6 border-b border-border flex flex-col sm:flex-row justify-between items-center gap-4 bg-muted/30">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            Aplicativos Cadastrados
            <span className="bg-muted text-muted-foreground text-xs px-2 py-1 rounded-full">{filteredApps.length}</span>
          </h2>
          
          <div className="flex w-full sm:w-auto items-center gap-3">
          <button
            type="button"
            onClick={() => setShowCategorias(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-background border border-input text-foreground rounded-xl hover:bg-muted/50 transition font-medium shadow-sm text-sm whitespace-nowrap"
            title="Criar, renomear e ordenar as categorias"
          >
            <TagIcon className="h-5 w-5 text-primary" />
            Categorias
            <span className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full">{categorias.length}</span>
          </button>
          <div className="relative w-full sm:w-80">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <input 
              type="text" 
              placeholder="Buscar por nome, email ou CNPJ..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-background text-foreground border border-input rounded-xl focus:ring-2 focus:ring-primary focus:border-primary outline-none transition shadow-sm text-base sm:text-sm"
            />
          </div>
          </div>
        </div>

        <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Aplicativo</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Documento</th>
                <th className="px-6 py-4 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">Usuários</th>
                <th className="px-6 py-4 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Cadastro</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-muted-foreground uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            {filteredApps.length === 0 ? (
              <tbody className="bg-card">
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      <MagnifyingGlassIcon className="h-12 w-12 text-muted-foreground mb-2 opacity-50" />
                      <p className="text-lg font-medium">Nenhum resultado encontrado.</p>
                    </div>
                  </td>
                </tr>
              </tbody>
            ) : grupos.map((grupo) => (
              <tbody key={grupo.id ?? 'sem-categoria'} className="bg-card divide-y divide-border">
                {/* Cabeçalho do grupo — só aparece quando existe ao menos uma categoria. */}
                {categorias.length > 0 && (
                  <tr className="bg-muted/40">
                    <td colSpan={6} className="px-6 py-2.5">
                      <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                        <TagIcon className={`h-4 w-4 ${grupo.id === null ? 'opacity-50' : 'text-primary'}`} />
                        <span className={grupo.id === null ? 'italic' : 'text-foreground'}>{grupo.nome}</span>
                        <span className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full normal-case font-medium tracking-normal">{grupo.apps.length}</span>
                      </div>
                    </td>
                  </tr>
                )}
                {grupo.apps.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-sm text-muted-foreground italic">
                      Nenhum aplicativo nesta categoria. Edite um aplicativo e escolha esta categoria para agrupá-lo aqui.
                    </td>
                  </tr>
                )}
                {grupo.apps.map((app, indice) => (
                  <tr key={app.id} className="hover:bg-muted/50 transition duration-150 group">
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex items-center">
                        {app.logo ? (
                          <img
                            src={app.logo}
                            alt={app.nome}
                            className="h-12 w-12 rounded-xl object-contain bg-background border border-border shadow-sm p-1"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                            {app.nome.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="ml-4">
                          <div className="text-base font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                            {app.nome}
                            <IntegrationBadge appId={app.id} />
                            <AppLinkBadge appId={app.id} />
                          </div>
                          <div className="text-sm text-muted-foreground">{app.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm text-muted-foreground font-mono">
                      {masks.cnpj(app.documento)}
                    </td>

                    <td className="px-6 py-5 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        (app.total_usuarios || 0) > 0 
                          ? 'bg-primary/20 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        <UsersIcon className="h-3 w-3 mr-1" />
                        {app.total_usuarios || 0}
                      </span>
                    </td>
                    
                    <td className="px-6 py-5 whitespace-nowrap text-center">
                      <div className="flex justify-center">
                        <StatusButton
                          currentStatus={app.status as 'ativo' | 'inativo'}
                          entityName={app.nome}
                          onStatusChange={() => handleStatusChange(app)}
                        />
                      </div>
                    </td>

                    <td className="px-6 py-5 whitespace-nowrap text-sm text-muted-foreground">
                      {app.data_cadastro ? (
                        new Date(app.data_cadastro).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })
                      ) : (
                        <span className="text-muted-foreground opacity-50">-</span>
                      )}
                    </td>

                    <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        {/* Subir/descer dentro da categoria. Travado durante busca. */}
                        <div className="flex flex-col mr-1">
                          <button
                            type="button"
                            onClick={() => handleMover(app, 'cima')}
                            disabled={buscando || !!movendo || indice === 0}
                            title={buscando ? 'Limpe a busca para reordenar' : 'Subir'}
                            className="p-0.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                          >
                            <ChevronUpIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMover(app, 'baixo')}
                            disabled={buscando || !!movendo || indice === grupo.apps.length - 1}
                            title={buscando ? 'Limpe a busca para reordenar' : 'Descer'}
                            className="p-0.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                          >
                            <ChevronDownIcon className="h-4 w-4" />
                          </button>
                        </div>

                        <button
                          onClick={() => navigate(`/apps/${app.id}/users`)}
                          className="px-3 py-1.5 text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition font-semibold text-xs border border-transparent"
                        >
                          Usuários
                        </button>

                        <button 
                          onClick={() => setAppToEdit(app)}
                          className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition border border-transparent"
                          title="Editar Dados da Aplicativo"
                        >
                          <PencilSquareIcon className="h-5 w-5" />
                        </button>

                        <button 
                          onClick={() => handleDeleteClick(app)}
                          className="p-2 text-muted-foreground hover:text-danger hover:bg-danger/10 rounded-lg transition border border-transparent"
                          title="Excluir Aplicativo"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
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

      <CategoriasModal
        isOpen={showCategorias}
        onClose={() => setShowCategorias(false)}
        onChanged={fetchApps}
      />

      <EditAppModal
        isOpen={!!appToEdit}
        onClose={() => setAppToEdit(null)}
        app={appToEdit}
        categorias={categorias}
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