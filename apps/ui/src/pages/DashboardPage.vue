<script setup lang="ts">
import { apagarTudoLocal } from '@/features/cofre/local';
import { computed, onMounted, ref } from 'vue';
import {
  ArrowRightOnRectangleIcon,
  BanknotesIcon,
  BuildingOfficeIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  EllipsisHorizontalCircleIcon,
  LinkIcon,
  FingerPrintIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  PuzzlePieceIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  TagIcon,
  TrashIcon,
  UserPlusIcon,
  UsersIcon,
} from '@heroicons/vue/24/outline';
import { appApi, authApi, categoriaApi } from '@loginhub/api-client';
import type { App, Categoria, DirecaoMovimento, EscopoDoPainel } from '@loginhub/schema';
import { masks } from '@/utils/masks';
import { getAppIntegration } from '@/config/integrations';
import { getAppLinks } from '@/config/appLinks';
import { fundoDoLogo } from '@/config/logoFundo';
import UiNavBar from '@/components/ui/UiNavBar.vue';
import MasterDigitalSheet from '@/components/seguranca/MasterDigitalSheet.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiRow from '@/components/ui/UiRow.vue';
import UiSheet from '@/components/ui/UiSheet.vue';
import UiSearchField from '@/components/ui/UiSearchField.vue';
import UiSection from '@/components/ui/UiSection.vue';
import UiAlert from '@/components/ui/UiAlert.vue';
import UiEmpty from '@/components/ui/UiEmpty.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiSpinner from '@/components/ui/UiSpinner.vue';
import StatusButton from '@/components/StatusButton.vue';
import EditAppSheet from '@/components/apps/EditAppSheet.vue';
import CategoriasSheet from '@/components/apps/CategoriasSheet.vue';
import AdminsOrganizacaoSheet from '@/components/apps/AdminsOrganizacaoSheet.vue';
import IntegrationBadge from '@/components/integration/IntegrationBadge.vue';
import AppLinkBadge from '@/components/integration/AppLinkBadge.vue';

// Estados
const apps = ref<App[]>([]);
const categorias = ref<Categoria[]>([]);
const busca = ref('');
const carregando = ref(true);

// Estados de folhas, alertas e ações
const mostrarSair = ref(false);
const mostrarCategorias = ref(false);
// Celular (26/11/2026): os controles do topo e de cada app não cabem em ~390px; ficam agrupados em folhas.
const mostrarMaisTopo = ref(false);
const appMenu = ref<App | null>(null);
const noMenu = (acao: () => void) => {
  mostrarMaisTopo.value = false;
  acao();
  appMenu.value = null;
};
// Id do app cuja seta acabou de ser clicada: trava as setas até a lista voltar.
const movendo = ref<string | null>(null);
const excluindo = ref(false);
const appParaExcluir = ref<App | null>(null);
const appParaEditar = ref<App | null>(null);
const alerta = ref<{ titulo: string; mensagem: string } | null>(null);

const mostrarErro = (titulo: string, mensagem: string) => (alerta.value = { titulo, mensagem });

// Quem está no painel (19/11/2026, db/012). Master vê e faz tudo; admin de
// organização vê só os apps das organizações dele e não cria/edita/exclui app
// nem mexe em categorias e vendas — a API recusa de qualquer jeito, a tela só
// não oferece o que não vai funcionar.
const eu = ref<EscopoDoPainel | null>(null);
const master = computed(() => eu.value?.master === true);
// Digital do master (db/020): cadastra a biometria deste aparelho para entrar sem digitar a Master Key.
const mostrarDigitalMaster = ref(false);
// "Convidar admin": aberta com a organização do grupo (ou a primeira).
const adminsDe = ref<number | null | undefined>(undefined);
const mostrarAdmins = computed(() => adminsDe.value !== undefined);
// Selo do botão "Admins": quantos admins de organização cuidam do grupo.
const adminsDoGrupo = (id: number | null) => categorias.value.find((c) => c.id === id)?.total_admins ?? 0;
const nomesDosAdmins = (id: number | null | undefined) => categorias.value.find((c) => c.id === id)?.admins_nomes ?? [];
function fecharAdmins() {
  adminsDe.value = undefined;
  // Convidou ou tirou alguém: atualiza o selo.
  void carregar();
}

// Busca dados iniciais. A API já devolve os apps na ordem do painel
// (categoria, depois `ordem`); a tela só agrupa, nunca reordena.
async function carregar() {
  try {
    const [listaApps, listaCategorias, quem] = await Promise.all([appApi.getAll(), categoriaApi.getAll(), authApi.eu()]);
    apps.value = listaApps;
    categorias.value = listaCategorias;
    eu.value = quem;
  } catch (e) {
    console.error('Erro ao buscar aplicativos', e);
  } finally {
    carregando.value = false;
  }
}

onMounted(carregar);

const filtrados = computed(() => {
  const termo = busca.value.toLowerCase();
  return apps.value.filter(
    (c) => c.nome.toLowerCase().includes(termo) || c.email.toLowerCase().includes(termo) || c.documento.includes(termo),
  );
});

const buscando = computed(() => busca.value.trim().length > 0);

/**
 * Grupos na ordem das categorias, com "Sem categoria" por último. Categoria
 * vazia aparece (para o usuário ver que existe) — exceto durante uma busca,
 * quando só interessa quem casou com o termo.
 */
const grupos = computed(() => {
  const porCategoria = new Map<number | null, App[]>();
  for (const app of filtrados.value) {
    const chave = app.categoria_id ?? null;
    const lista = porCategoria.get(chave) ?? [];
    lista.push(app);
    porCategoria.set(chave, lista);
  }
  const resultado: Array<{ id: number | null; nome: string; apps: App[] }> = [];
  for (const c of categorias.value) {
    const lista = porCategoria.get(c.id) ?? [];
    if (lista.length > 0 || !buscando.value) resultado.push({ id: c.id, nome: c.nome, apps: lista });
  }
  const semCategoria = porCategoria.get(null) ?? [];
  if (master.value && (semCategoria.length > 0 || (!buscando.value && categorias.value.length > 0))) {
    resultado.push({ id: null, nome: 'Sem categoria', apps: semCategoria });
  }
  return resultado;
});

// --- AÇÕES ---

function sair() {
  // Sair da conta apaga do aparelho a cópia do cofre e a sessão guardada (features/cofre/local.ts).
  void apagarTudoLocal().finally(() => authApi.logout());
}

async function confirmarExclusao() {
  const alvo = appParaExcluir.value;
  if (!alvo) return;
  try {
    excluindo.value = true;
    await appApi.delete(alvo.id);
    // Atualiza a lista localmente para evitar refetch desnecessário
    apps.value = apps.value.filter((c) => c.id !== alvo.id);
    appParaExcluir.value = null;
  } catch (e) {
    console.error(e);
    mostrarErro('Erro', 'Não foi possível excluir o aplicativo.');
  } finally {
    excluindo.value = false;
  }
}

async function alternarStatus(app: App) {
  const novoStatus = app.status === 'ativo' ? 'inativo' : 'ativo';
  try {
    await appApi.toggleStatus(app.id, novoStatus);
    apps.value = apps.value.map((c) => (c.id === app.id ? { ...c, status: novoStatus } : c));
  } catch (e) {
    console.error(e);
    mostrarErro('Erro', 'Não foi possível atualizar o status do aplicativo.');
  }
}

// --- Ordem dentro da categoria ---
// Só troca com o vizinho da MESMA categoria; a API renumera o grupo. Durante
// uma busca as setas ficam travadas: o vizinho visível pode não ser o real.
async function mover(app: App, direcao: DirecaoMovimento) {
  if (movendo.value || buscando.value) return;
  movendo.value = app.id;
  try {
    await appApi.mover(app.id, direcao);
    await carregar();
  } catch (e) {
    console.error(e);
    mostrarErro('Erro', 'Não foi possível mover o aplicativo.');
  } finally {
    movendo.value = null;
  }
}

function aoSalvarApp() {
  appParaEditar.value = null;
  void carregar();
}

const ativos = computed(() => apps.value.filter((c) => c.status === 'ativo').length);
// Apps que mantêm uma API conversando com o hub (ver config/integrations.ts).
const integrados = computed(() => apps.value.filter((c) => getAppIntegration(c.id)).length);
// Apps que aparecem dentro de outro app (ver config/appLinks.ts). Conta
// aplicativo, não pessoa: o vínculo em si é cadastrado usuário a usuário.
const vinculados = computed(() => apps.value.filter((c) => getAppLinks(c.id).length > 0).length);

const resumo = computed(() => [
  { rotulo: 'Ativos', valor: ativos.value, icone: BuildingOfficeIcon, cor: 'bg-accent/15 text-accent' },
  { rotulo: 'Cadastrados', valor: apps.value.length, icone: Squares2X2Icon, cor: 'bg-fill text-label' },
  {
    rotulo: 'APIs vinculadas',
    valor: integrados.value,
    nota: 'Apps que falam com o hub por trás',
    icone: LinkIcon,
    cor: 'bg-indigo/15 text-indigo',
  },
  {
    rotulo: 'Apps integrados',
    valor: vinculados.value,
    nota: 'Apps que mostram dados de outro app, por usuário',
    icone: PuzzlePieceIcon,
    cor: 'bg-warning/15 text-warning',
  },
]);

// O tipo aceita grafias antigas ('ativa', 'bloqueado'…); o selo só conhece as duas.
const statusDe = (app: App) => (app.status === 'ativo' ? 'ativo' : 'inativo');

const dataCadastro = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

// Colunas da lista no desktop; no celular cada linha empilha.
// Abaixo de xl a coluna Documento sai da grade (o CNPJ desce para baixo do e-mail do app): sem isso a coluna do
// aplicativo ficava estreita e os selos passavam por cima do documento.
const GRADE =
  'md:grid md:grid-cols-[minmax(0,1fr)_7.5rem_7rem_6.5rem_21rem] md:items-center md:gap-4 xl:grid-cols-[minmax(0,1fr)_10.5rem_7.5rem_7rem_6.5rem_21rem]';
const seta =
  'flex h-toque w-8 items-center justify-center rounded-lg text-label-2 hover:bg-accent/10 hover:text-accent disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-label-2';
</script>

<template>
  <div class="animate-fade-in">
    <MasterDigitalSheet v-if="master" :aberto="mostrarDigitalMaster" @fechar="mostrarDigitalMaster = false" />
    <UiNavBar
      titulo="Aplicativos"
      :subtitulo="eu && !eu.master ? `LoginHub · ${eu.nome} · ${eu.organizacoes.map((o) => o.nome).join(', ')}` : 'LoginHub · gestão centralizada de aplicativos e infraestrutura'"
    >
      <template #acoes>
        <!-- Celular: só "Mais" e "Novo"; o resto vai para a folha. sm+ segue igual. -->
        <UiButton v-if="master" class="sm:hidden" variante="plain" icone aria-label="Mais opções" title="Categorias e digital do master" @click="mostrarMaisTopo = true">
          <EllipsisHorizontalCircleIcon class="h-6 w-6" />
        </UiButton>
        <div class="hidden items-center gap-1 sm:flex">
          <UiButton v-if="master" variante="plain" icone aria-label="Categorias" title="Criar, renomear e ordenar as categorias" @click="mostrarCategorias = true">
            <TagIcon class="h-6 w-6" />
          </UiButton>
          <UiButton v-if="master" variante="plain" icone aria-label="Digital do master" title="Entrar no painel com a digital (Touch ID, Face ID)" @click="mostrarDigitalMaster = true">
            <FingerPrintIcon class="h-6 w-6" />
          </UiButton>
          <UiButton v-if="master" variante="gray" tamanho="small" to="/cofre" title="Cofre de senhas e códigos 2FA, cifrado no navegador">
            <LockClosedIcon class="h-4 w-4" />
            Cofre
          </UiButton>
          <!-- O "Convidar admin" do topo saiu (19/11/2026, pedido do dono): cada app e cada
               organização tem o próprio botão Admins, já presos à organização certa. -->
        </div>
        <UiButton v-if="master" class="sm:hidden" variante="gray" tamanho="small" to="/cofre" title="Cofre de senhas e códigos 2FA">
          <LockClosedIcon class="h-4 w-4" />
          Cofre
        </UiButton>
        <UiButton v-if="master" tamanho="small" to="/apps/new" title="Novo aplicativo">
          <PlusIcon class="h-4 w-4" stroke-width="2.5" />
          App
        </UiButton>
        <!-- Sair é sempre o último controle da barra (26/11/2026, pedido do dono). -->
        <UiButton variante="plain" icone aria-label="Sair" title="Sair" class="!text-danger hover:!bg-danger/10" @click="mostrarSair = true">
          <ArrowRightOnRectangleIcon class="h-6 w-6" />
        </UiButton>
      </template>
    </UiNavBar>

    <div class="mt-4 space-y-8">
      <!-- RESUMO -->
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div v-for="item in resumo" :key="item.rotulo" class="rounded-celula bg-surface p-4">
          <div class="flex items-center justify-between gap-2">
            <p class="text-subhead font-medium text-label-2">{{ item.rotulo }}</p>
            <span class="flex h-8 w-8 items-center justify-center rounded-lg" :class="item.cor">
              <component :is="item.icone" class="h-5 w-5" />
            </span>
          </div>
          <p class="mt-2 text-title-1 font-bold tabular-nums">{{ item.valor }}</p>
          <p v-if="item.nota" class="mt-0.5 text-caption-1 text-label-2">{{ item.nota }}</p>
        </div>
      </div>

      <!-- BUSCA E CATEGORIAS -->
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="flex items-baseline gap-2 sm:flex-1">
          <h2 class="text-title-3 font-semibold">Cadastrados</h2>
          <UiBadge>{{ filtrados.length }}</UiBadge>
        </div>
        <div class="flex items-center gap-2 sm:w-[26rem]">
          <UiSearchField v-model="busca" placeholder="Buscar por nome, e-mail ou CNPJ" />
          <UiButton v-if="master" variante="gray" tamanho="small" class="shrink-0" @click="mostrarCategorias = true">
            <TagIcon class="h-4 w-4" />
            Categorias
            <span class="text-label-2">{{ categorias.length }}</span>
          </UiButton>
        </div>
      </div>

      <div v-if="carregando" class="flex justify-center py-16 text-label-2"><UiSpinner class="h-8 w-8" /></div>

      <UiSection v-else-if="filtrados.length === 0">
        <UiEmpty
          :icone="MagnifyingGlassIcon"
          :titulo="buscando ? 'Nenhum resultado encontrado.' : 'Nenhum aplicativo cadastrado.'"
          :texto="buscando ? 'Tente outro nome, e-mail ou CNPJ.' : undefined"
        >
          <UiButton v-if="!buscando && master" to="/apps/new"><PlusIcon class="h-5 w-5" />Novo aplicativo</UiButton>
        </UiEmpty>
      </UiSection>

      <div v-else class="space-y-6">
        <!-- cabeçalho das colunas, só no desktop -->
        <div :class="GRADE" class="hidden px-4 text-caption-1 font-semibold uppercase tracking-wide text-label-2 md:grid">
          <span>Aplicativo</span>
          <span class="hidden xl:inline">Documento</span>
          <span class="text-center">Usuários · Admins</span>
          <span class="text-center">Status</span>
          <span>Cadastro</span>
          <span class="text-right">Ações</span>
        </div>

        <UiSection v-for="grupo in grupos" :key="grupo.id ?? 'sem-categoria'" lista>
          <!-- Cabeçalho do grupo — só aparece quando existe ao menos uma categoria. -->
          <template v-if="categorias.length > 0" #acao>
            <span class="flex flex-1 items-center gap-2 text-footnote font-medium uppercase tracking-wide text-label-2">
              <TagIcon class="h-4 w-4" :class="grupo.id === null ? 'opacity-50' : 'text-accent'" />
              <span :class="grupo.id === null ? 'italic' : 'text-label'">{{ grupo.nome }}</span>
              <UiBadge>{{ grupo.apps.length }}</UiBadge>
            </span>
            <UiButton
              v-if="grupo.id !== null"
              variante="plain"
              tamanho="small"
              :aria-label="`Admins de ${grupo.nome}`"
              title="Admins desta organização: convidar e remover"
              @click="adminsDe = grupo.id"
            >
              <UserPlusIcon class="h-4 w-4" />
              Admins
              <UiBadge :tom="adminsDoGrupo(grupo.id) > 0 ? 'accent' : 'neutro'" :title="`${adminsDoGrupo(grupo.id)} admin(s) nesta organização`">
                {{ adminsDoGrupo(grupo.id) }}
              </UiBadge>
            </UiButton>
          </template>

          <p v-if="grupo.apps.length === 0" class="px-4 py-4 text-subhead italic text-label-2">
            Nenhum aplicativo nesta categoria. Edite um aplicativo e escolha esta categoria para agrupá-lo aqui.
          </p>

          <div v-for="(app, indice) in grupo.apps" :key="app.id" :class="GRADE" class="flex flex-col gap-3 px-4 py-3">
            <!-- identidade -->
            <div class="flex min-w-0 items-center gap-3">
              <img
                v-if="app.logo"
                :src="app.logo"
                :alt="app.nome"
                class="h-12 w-12 shrink-0 rounded-[12px] object-contain p-1 ring-1 ring-separator"
                :class="fundoDoLogo(app.id)"
              />
              <div
                v-else
                class="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-accent/15 text-headline font-bold text-accent"
                aria-hidden="true"
              >
                {{ app.nome.substring(0, 2).toUpperCase() }}
              </div>
              <div class="min-w-0 flex-1">
                <p class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-headline font-semibold">
                  <span class="truncate">{{ app.nome }}</span>
                  <IntegrationBadge :app-id="app.id" />
                  <AppLinkBadge :app-id="app.id" />
                </p>
                <p class="truncate text-subhead text-label-2" :title="app.email">{{ app.email }}</p>
                <p class="hidden truncate font-mono text-caption-1 text-label-2 md:block xl:hidden">{{ masks.cnpj(app.documento) }}</p>
                <!-- Quem cuida do app no hub (admins da organização, db/012). Toque abre a gaveta. -->
                <button
                  v-if="app.categoria_id !== null && app.categoria_id !== undefined"
                  type="button"
                  class="mt-0.5 flex max-w-full items-center gap-1 truncate text-caption-1 hover:underline"
                  :class="nomesDosAdmins(app.categoria_id).length ? 'text-success' : 'text-label-2'"
                  :title="nomesDosAdmins(app.categoria_id).length ? `Admins: ${nomesDosAdmins(app.categoria_id).join(', ')}` : 'Nenhum admin nesta organização: convide um'"
                  @click="adminsDe = app.categoria_id"
                >
                  <ShieldCheckIcon class="h-3.5 w-3.5 shrink-0" />
                  <span class="truncate">{{ nomesDosAdmins(app.categoria_id).length ? `Admins: ${nomesDosAdmins(app.categoria_id).join(', ')}` : 'Sem admin · convidar' }}</span>
                </button>
              </div>
            </div>

            <!-- metadados: uma linha no celular, colunas no desktop -->
            <div class="flex flex-wrap items-center gap-x-3 gap-y-2 md:contents">
              <span class="font-mono text-footnote text-label-2 md:hidden md:text-subhead xl:inline">{{ masks.cnpj(app.documento) }}</span>
              <span class="md:flex md:justify-center">
                <span class="inline-flex items-center gap-1.5">
                  <UiBadge :tom="(app.total_usuarios || 0) > 0 ? 'accent' : 'neutro'" :title="`${app.total_usuarios || 0} usuários`">
                    <UsersIcon class="h-3 w-3" />
                    {{ app.total_usuarios || 0 }}
                  </UiBadge>
                  <!-- Admins da organização do app (db/012): quem cuida dele no hub. -->
                  <UiBadge
                    v-if="app.categoria_id !== null && app.categoria_id !== undefined"
                    :tom="adminsDoGrupo(app.categoria_id) > 0 ? 'success' : 'neutro'"
                    :title="`${adminsDoGrupo(app.categoria_id)} admin(s) da organização cuidam deste app`"
                  >
                    <ShieldCheckIcon class="h-3 w-3" />
                    {{ adminsDoGrupo(app.categoria_id) }}
                  </UiBadge>
                </span>
              </span>
              <span class="md:flex md:justify-center">
                <StatusButton v-if="master" :status="statusDe(app)" :nome="app.nome" @alternar="alternarStatus(app)" />
                <UiBadge v-else :tom="statusDe(app) === 'ativo' ? 'success' : 'neutro'">{{ statusDe(app) }}</UiBadge>
              </span>
              <span class="text-footnote text-label-2 md:text-subhead">{{ dataCadastro(app.data_cadastro) }}</span>
            </div>

            <!-- ações: celular = Usuários + "⋯" (folha); md+ = tudo na linha -->
            <div class="flex items-center gap-1 md:justify-end">
              <template v-if="master">
                <button
                  type="button"
                  class="hidden md:inline-flex"
                  :class="seta"
                  :disabled="buscando || !!movendo || indice === 0"
                  :title="buscando ? 'Limpe a busca para reordenar' : 'Subir'"
                  :aria-label="`Subir ${app.nome}`"
                  @click="mover(app, 'cima')"
                >
                  <ChevronUpIcon class="h-5 w-5" />
                </button>
                <button
                  type="button"
                  class="hidden md:inline-flex"
                  :class="seta"
                  :disabled="buscando || !!movendo || indice === grupo.apps.length - 1"
                  :title="buscando ? 'Limpe a busca para reordenar' : 'Descer'"
                  :aria-label="`Descer ${app.nome}`"
                  @click="mover(app, 'baixo')"
                >
                  <ChevronDownIcon class="h-5 w-5" />
                </button>
              </template>

              <UiButton variante="tinted" tamanho="small" class="ml-auto md:ml-1" :to="`/apps/${app.id}/users`">Usuários</UiButton>
              <!-- Gerenciar os admins da organização do app: convidar, resetar senha, tirar. -->
              <UiButton
                v-if="app.categoria_id !== null && app.categoria_id !== undefined"
                class="hidden md:inline-flex"
                variante="tinted"
                tamanho="small"
                :title="`Admins de ${app.nome}: convidar, resetar senha e tirar`"
                @click="adminsDe = app.categoria_id"
              >
                Admins
              </UiButton>
              <UiButton v-if="master" class="hidden md:inline-flex" variante="plain" icone :aria-label="`Vendas de ${app.nome}`" title="Vendas: preço, afiliados e assinantes" :to="`/apps/${app.id}/vendas`">
                <BanknotesIcon class="h-5 w-5" />
              </UiButton>
              <UiButton v-if="master" class="hidden md:inline-flex" variante="plain" icone :aria-label="`Editar ${app.nome}`" title="Editar dados do aplicativo" @click="appParaEditar = app">
                <PencilSquareIcon class="h-5 w-5" />
              </UiButton>
              <UiButton
                v-if="master"
                class="hidden !text-danger hover:!bg-danger/10 md:inline-flex"
                variante="plain"
                icone
                :aria-label="`Excluir ${app.nome}`"
                title="Excluir aplicativo"
                @click="appParaExcluir = app"
              >
                <TrashIcon class="h-5 w-5" />
              </UiButton>
              <UiButton class="md:hidden" variante="plain" icone :aria-label="`Mais opções de ${app.nome}`" @click="appMenu = app">
                <EllipsisHorizontalCircleIcon class="h-6 w-6" />
              </UiButton>
            </div>
          </div>
        </UiSection>
      </div>
    </div>

    <!-- FOLHAS DO CELULAR: topo e cada app -->
    <UiSheet :aberto="mostrarMaisTopo" titulo="Painel" largura="sm" @fechar="mostrarMaisTopo = false">
      <div class="divide-y overflow-hidden rounded-celula bg-surface [&>*]:border-separator">
        <template v-if="master">
          <UiRow clicavel chevron titulo="Categorias" subtitulo="Criar, renomear e ordenar" @click="noMenu(() => (mostrarCategorias = true))">
            <template #icone><TagIcon class="text-accent" /></template>
          </UiRow>
          <UiRow clicavel chevron titulo="Digital do master" subtitulo="Entrar com Touch ID ou Face ID" @click="noMenu(() => (mostrarDigitalMaster = true))">
            <template #icone><FingerPrintIcon class="text-accent" /></template>
          </UiRow>
        </template>
      </div>
    </UiSheet>

    <UiSheet :aberto="!!appMenu" :titulo="appMenu?.nome ?? ''" largura="sm" @fechar="appMenu = null">
      <div v-if="appMenu" class="divide-y overflow-hidden rounded-celula bg-surface [&>*]:border-separator">
        <UiRow
          v-if="appMenu.categoria_id !== null && appMenu.categoria_id !== undefined"
          clicavel
          chevron
          titulo="Admins"
          subtitulo="Convidar, resetar senha e tirar"
          @click="noMenu(() => (adminsDe = appMenu?.categoria_id))"
        >
          <template #icone><UserPlusIcon class="text-accent" /></template>
        </UiRow>
        <template v-if="master">
          <UiRow :to="`/apps/${appMenu.id}/vendas`" titulo="Vendas" subtitulo="Preço, afiliados e assinantes">
            <template #icone><BanknotesIcon class="text-accent" /></template>
          </UiRow>
          <UiRow clicavel chevron titulo="Editar" subtitulo="Dados do aplicativo" @click="noMenu(() => (appParaEditar = appMenu))">
            <template #icone><PencilSquareIcon class="text-accent" /></template>
          </UiRow>
          <UiRow
            clicavel
            titulo="Subir na lista"
            :class="buscando || !!movendo ? 'pointer-events-none opacity-40' : ''"
            @click="noMenu(() => appMenu && mover(appMenu, 'cima'))"
          >
            <template #icone><ChevronUpIcon class="text-accent" /></template>
          </UiRow>
          <UiRow
            clicavel
            titulo="Descer na lista"
            :class="buscando || !!movendo ? 'pointer-events-none opacity-40' : ''"
            @click="noMenu(() => appMenu && mover(appMenu, 'baixo'))"
          >
            <template #icone><ChevronDownIcon class="text-accent" /></template>
          </UiRow>
          <UiRow clicavel titulo="Excluir" @click="noMenu(() => (appParaExcluir = appMenu))">
            <template #icone><TrashIcon class="text-danger" /></template>
          </UiRow>
        </template>
      </div>
    </UiSheet>

    <!-- FOLHAS E ALERTAS -->
    <UiAlert
      :aberto="mostrarSair"
      tom="danger"
      :icone="ArrowRightOnRectangleIcon"
      titulo="Sair do painel?"
      confirmar="Sair"
      @fechar="mostrarSair = false"
      @confirmar="sair"
    >
      <template v-if="master">Você terá que inserir a <strong>Master Key</strong> novamente para acessar o painel administrativo da Astral Wave.</template>
      <template v-else>Para voltar, entre de novo com e-mail e senha (ou só com o código enviado ao e-mail), confirmando o código de verificação.</template>
    </UiAlert>

    <UiAlert
      :aberto="!!appParaExcluir"
      tom="danger"
      :icone="TrashIcon"
      titulo="Excluir aplicativo"
      :destaque="appParaExcluir?.nome"
      confirmar="Excluir"
      :carregando="excluindo"
      texto-carregando="Excluindo…"
      @fechar="appParaExcluir = null"
      @confirmar="confirmarExclusao"
    >
      Você tem certeza que deseja realizar esta ação? <strong class="text-danger">Ela é irreversível.</strong>
    </UiAlert>

    <AdminsOrganizacaoSheet
      :aberto="mostrarAdmins"
      :organizacoes="eu?.organizacoes ?? []"
      :inicial="adminsDe ?? null"
      :meu-email="eu?.email"
      @fechar="fecharAdmins"
    />

    <CategoriasSheet :aberto="mostrarCategorias" @fechar="mostrarCategorias = false" @mudou="carregar" />

    <EditAppSheet :app="appParaEditar" :categorias="categorias" @fechar="appParaEditar = null" @salvo="aoSalvarApp" />

    <UiAlert
      :aberto="!!alerta"
      tom="danger"
      :titulo="alerta?.titulo ?? ''"
      :mensagem="alerta?.mensagem"
      :cancelar="null"
      confirmar="Entendi"
      @fechar="alerta = null"
    />
  </div>
</template>
