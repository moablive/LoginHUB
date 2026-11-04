<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  ArrowRightOnRectangleIcon,
  BuildingOfficeIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  PuzzlePieceIcon,
  Squares2X2Icon,
  TagIcon,
  TrashIcon,
  UsersIcon,
} from '@heroicons/vue/24/outline';
import { appApi, authApi, categoriaApi } from '@loginhub/api-client';
import type { App, Categoria, DirecaoMovimento } from '@loginhub/schema';
import { masks } from '@/utils/masks';
import { getAppIntegration } from '@/config/integrations';
import { getAppLinks } from '@/config/appLinks';
import UiNavBar from '@/components/ui/UiNavBar.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiSearchField from '@/components/ui/UiSearchField.vue';
import UiSection from '@/components/ui/UiSection.vue';
import UiAlert from '@/components/ui/UiAlert.vue';
import UiEmpty from '@/components/ui/UiEmpty.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiSpinner from '@/components/ui/UiSpinner.vue';
import StatusButton from '@/components/StatusButton.vue';
import EditAppSheet from '@/components/apps/EditAppSheet.vue';
import CategoriasSheet from '@/components/apps/CategoriasSheet.vue';
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
// Id do app cuja seta acabou de ser clicada: trava as setas até a lista voltar.
const movendo = ref<string | null>(null);
const excluindo = ref(false);
const appParaExcluir = ref<App | null>(null);
const appParaEditar = ref<App | null>(null);
const alerta = ref<{ titulo: string; mensagem: string } | null>(null);

const mostrarErro = (titulo: string, mensagem: string) => (alerta.value = { titulo, mensagem });

// Busca dados iniciais. A API já devolve os apps na ordem do painel
// (categoria, depois `ordem`); a tela só agrupa, nunca reordena.
async function carregar() {
  try {
    const [listaApps, listaCategorias] = await Promise.all([appApi.getAll(), categoriaApi.getAll()]);
    apps.value = listaApps;
    categorias.value = listaCategorias;
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
  if (semCategoria.length > 0 || (!buscando.value && categorias.value.length > 0)) {
    resultado.push({ id: null, nome: 'Sem categoria', apps: semCategoria });
  }
  return resultado;
});

// --- AÇÕES ---

function sair() {
  authApi.logout();
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
const GRADE = 'md:grid md:grid-cols-[minmax(0,1fr)_10.5rem_4.5rem_7rem_6rem_13.5rem] md:items-center md:gap-4';
const seta =
  'flex h-toque w-9 items-center justify-center rounded-lg text-label-2 hover:bg-accent/10 hover:text-accent disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-label-2';
</script>

<template>
  <div class="animate-fade-in">
    <UiNavBar titulo="Aplicativos" subtitulo="LoginHub · gestão centralizada de aplicativos e infraestrutura">
      <template #acoes>
        <UiButton variante="plain" icone aria-label="Categorias" title="Criar, renomear e ordenar as categorias" @click="mostrarCategorias = true">
          <TagIcon class="h-6 w-6" />
        </UiButton>
        <UiButton variante="plain" icone aria-label="Sair" title="Sair" class="!text-danger hover:!bg-danger/10" @click="mostrarSair = true">
          <ArrowRightOnRectangleIcon class="h-6 w-6" />
        </UiButton>
        <UiButton tamanho="small" to="/apps/new">
          <PlusIcon class="h-4 w-4" stroke-width="2.5" />
          Novo
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
          <UiButton variante="gray" tamanho="small" class="shrink-0" @click="mostrarCategorias = true">
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
          <UiButton v-if="!buscando" to="/apps/new"><PlusIcon class="h-5 w-5" />Novo aplicativo</UiButton>
        </UiEmpty>
      </UiSection>

      <div v-else class="space-y-6">
        <!-- cabeçalho das colunas, só no desktop -->
        <div :class="GRADE" class="hidden px-4 text-caption-1 font-semibold uppercase tracking-wide text-label-2 md:grid">
          <span>Aplicativo</span>
          <span>Documento</span>
          <span class="text-center">Usuários</span>
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
                class="h-12 w-12 shrink-0 rounded-[12px] bg-white object-contain p-1 ring-1 ring-separator"
              />
              <div
                v-else
                class="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-accent/15 text-headline font-bold text-accent"
                aria-hidden="true"
              >
                {{ app.nome.substring(0, 2).toUpperCase() }}
              </div>
              <div class="min-w-0">
                <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-headline font-semibold">
                  <span class="truncate">{{ app.nome }}</span>
                  <IntegrationBadge :app-id="app.id" />
                  <AppLinkBadge :app-id="app.id" />
                </p>
                <p class="truncate text-subhead text-label-2">{{ app.email }}</p>
              </div>
            </div>

            <!-- metadados: uma linha no celular, colunas no desktop -->
            <div class="flex flex-wrap items-center gap-x-3 gap-y-2 md:contents">
              <span class="font-mono text-footnote text-label-2 md:text-subhead">{{ masks.cnpj(app.documento) }}</span>
              <span class="md:flex md:justify-center">
                <UiBadge :tom="(app.total_usuarios || 0) > 0 ? 'accent' : 'neutro'" :title="`${app.total_usuarios || 0} usuários`">
                  <UsersIcon class="h-3 w-3" />
                  {{ app.total_usuarios || 0 }}
                </UiBadge>
              </span>
              <span class="md:flex md:justify-center">
                <StatusButton :status="statusDe(app)" :nome="app.nome" @alternar="alternarStatus(app)" />
              </span>
              <span class="text-footnote text-label-2 md:text-subhead">{{ dataCadastro(app.data_cadastro) }}</span>
            </div>

            <!-- ações -->
            <div class="-mx-2 flex items-center gap-1 md:mx-0 md:justify-end">
              <!-- Subir/descer dentro da categoria. Travado durante busca. -->
              <button
                type="button"
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
                :class="seta"
                :disabled="buscando || !!movendo || indice === grupo.apps.length - 1"
                :title="buscando ? 'Limpe a busca para reordenar' : 'Descer'"
                :aria-label="`Descer ${app.nome}`"
                @click="mover(app, 'baixo')"
              >
                <ChevronDownIcon class="h-5 w-5" />
              </button>

              <UiButton variante="tinted" tamanho="small" class="ml-auto md:ml-1" :to="`/apps/${app.id}/users`">Usuários</UiButton>

              <UiButton variante="plain" icone :aria-label="`Editar ${app.nome}`" title="Editar dados do aplicativo" @click="appParaEditar = app">
                <PencilSquareIcon class="h-5 w-5" />
              </UiButton>
              <UiButton
                variante="plain"
                icone
                class="!text-danger hover:!bg-danger/10"
                :aria-label="`Excluir ${app.nome}`"
                title="Excluir aplicativo"
                @click="appParaExcluir = app"
              >
                <TrashIcon class="h-5 w-5" />
              </UiButton>
            </div>
          </div>
        </UiSection>
      </div>
    </div>

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
      Você terá que inserir a <strong>Master Key</strong> novamente para acessar o painel administrativo da Astral Wave.
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
