<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import axios from 'axios';
import {
  ClipboardDocumentIcon,
  DevicePhoneMobileIcon,
  EllipsisHorizontalIcon,
  KeyIcon,
  LockClosedIcon,
  LockOpenIcon,
  PencilSquareIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
  TrashIcon,
  UserIcon,
  UserPlusIcon,
} from '@heroicons/vue/24/outline';
import { appApi, userApi } from '@loginhub/api-client';
import type { App, User } from '@loginhub/schema';
import { ResetPasswordEmail } from '@/templates/emails';
import { getAppIntegration } from '@/config/integrations';
import { getAppLinks } from '@/config/appLinks';
import { getProvisionedApp } from '@/config/provisioning';
import UiNavBar from '@/components/ui/UiNavBar.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiSection from '@/components/ui/UiSection.vue';
import UiSearchField from '@/components/ui/UiSearchField.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiEmpty from '@/components/ui/UiEmpty.vue';
import UiSpinner from '@/components/ui/UiSpinner.vue';
import UiAlert from '@/components/ui/UiAlert.vue';
import UiSheet from '@/components/ui/UiSheet.vue';
import UiRow from '@/components/ui/UiRow.vue';
import StatusButton from '@/components/StatusButton.vue';
import IntegrationLink from '@/components/integration/IntegrationLink.vue';
import AppLinkPanel from '@/components/integration/AppLinkPanel.vue';
import BloqueiosPanel from '@/components/seguranca/BloqueiosPanel.vue';
import CreateUserSheet from '@/components/users/CreateUserSheet.vue';
import EditUserSheet from '@/components/users/EditUserSheet.vue';

const props = defineProps<{ id: string }>();

// --- dados ---
const users = ref<User[]>([]);
const app = ref<App | null>(null);
const loading = ref(true);
const busca = ref('');

// Quem, entre estes usuários, também tem cadastro no app (ex.: vendedor da
// Sul). Guardado como Set de e-mail em minúsculas: a comparação é por e-mail
// porque é assim que o app acha o cadastro a partir do token.
const roster = ref<Set<string>>(new Set());
const rosterCfg = computed(() => getProvisionedApp(props.id)?.roster ?? null);

// --- folhas e alertas ---
const showFormModal = ref(false);
const showSuccessModal = ref(false);
const userToDelete = ref<User | null>(null);
const userToEdit = ref<User | null>(null);
const userToReset = ref<User | null>(null);
const userToReset2fa = ref<User | null>(null);
const userParaStatus = ref<User | null>(null);
// Folha de ações do celular: as cinco ações de uma linha não cabem na largura.
const userAcoes = ref<User | null>(null);
const isDeleting = ref(false);
const isResetting = ref<string | null>(null);
const isReset2fa = ref(false);

// Link de convite/reset quando o e-mail não saiu: precisa ser copiado à mão.
const credentialsAlert = ref({ isOpen: false, title: '', message: '' });
const copiado = ref(false);

const alertState = ref<{ isOpen: boolean; title: string; message: string; variant: 'error' | 'warning' | 'info' }>({
  isOpen: false,
  title: '',
  message: '',
  variant: 'error',
});
const TOM_ALERTA = { error: 'danger', warning: 'warning', info: 'info' } as const;

function showAlert(title: string, message: string, variant: 'error' | 'warning' | 'info' = 'error') {
  alertState.value = { isOpen: true, title, message, variant };
}

function mostrarLinkManual(title: string, magicLinkToken: string) {
  const loginUrlBase = (app.value?.platform_url || window.location.origin).replace(/\/+$/, '');
  copiado.value = false;
  credentialsAlert.value = {
    isOpen: true,
    title,
    message: `O e-mail não pôde ser enviado. Repasse o link manualmente:\n\nLink: ${loginUrlBase}/setup-password?token=${magicLinkToken}`,
  };
}

// --- carregamento ---
async function fetchData() {
  if (!props.id) return;
  try {
    const [usersData, appData] = await Promise.all([userApi.getByAppId(props.id), appApi.getById(props.id)]);
    users.value = usersData;
    app.value = appData;
  } catch (error) {
    console.error(error);
    showAlert('Erro de conexão', 'Não foi possível carregar os dados do aplicativo.', 'error');
  } finally {
    loading.value = false;
  }
}

// O selo não pode travar a tela: se o app estiver fora do ar, a lista segue
// sem ele — a informação é um reforço, não o conteúdo da página.
watch(
  rosterCfg,
  (cfg, _antigo, aoLimpar) => {
    if (!cfg) {
      roster.value = new Set();
      return;
    }
    const token = localStorage.getItem('awl_token');
    let vivo = true;
    aoLimpar(() => (vivo = false));
    void (async () => {
      try {
        const { data } = await axios.get(cfg.source, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          timeout: 20000,
        });
        const campo = cfg.matchField || 'email';
        const itens: Array<Record<string, unknown>> = Array.isArray(data) ? data : [];
        if (vivo) roster.value = new Set(itens.map((i) => String(i[campo] ?? '').toLowerCase()).filter(Boolean));
      } catch {
        if (vivo) roster.value = new Set();
      }
    })();
  },
  { immediate: true },
);

watch(
  () => props.id,
  () => {
    loading.value = true;
    void fetchData();
  },
  { immediate: true },
);

const filtrados = computed(() => {
  const t = busca.value.trim().toLowerCase();
  if (!t) return users.value;
  return users.value.filter(
    (u) => u.nome.toLowerCase().includes(t) || u.email.toLowerCase().includes(t) || (u.telefone || '').includes(t),
  );
});

const temIntegracao = computed(() => !!getAppIntegration(props.id));
const temVinculo = computed(() => getAppLinks(props.id).length > 0);
const ehDoRoster = (u: User) => !!rosterCfg.value && roster.value.has((u.email || '').toLowerCase());

// --- delete ---
async function handleConfirmDelete() {
  const alvo = userToDelete.value;
  if (!alvo) return;
  try {
    isDeleting.value = true;
    await userApi.delete(alvo.id);
    users.value = users.value.filter((u) => u.id !== alvo.id);
    userToDelete.value = null;
    showAlert('Sucesso', 'Usuário removido com sucesso.', 'info');
  } catch (error: unknown) {
    console.error(error);
    userToDelete.value = null;
    if (axios.isAxiosError(error)) {
      const msg = error.response?.data?.message || 'Não foi possível excluir o usuário.';
      showAlert('Erro ao excluir', msg, 'error');
    } else {
      showAlert('Erro inesperado', 'Ocorreu um erro ao tentar excluir o usuário.', 'error');
    }
  } finally {
    isDeleting.value = false;
  }
}

// --- status ---
async function handleToggleStatus(user: User) {
  userParaStatus.value = null;
  try {
    const newStatus = user.status === 'ativo' ? 'bloqueado' : 'ativo';
    await userApi.toggleStatus(user.id, newStatus);
    users.value = users.value.map((u) => (u.id === user.id ? { ...u, status: newStatus } : u));
    showAlert(
      'Status atualizado',
      `O usuário ${user.nome} foi ${newStatus === 'ativo' ? 'desbloqueado' : 'bloqueado'} com sucesso.`,
      'info',
    );
  } catch (error) {
    console.error('Erro ao alterar status:', error);
    showAlert('Erro', 'Não foi possível alterar o status do usuário.', 'error');
  }
}

// --- reset 2FA ---
// Caminho de quem perdeu o celular E os códigos de recuperação. Não isenta
// do 2FA: descarta o autenticador e a conta reenrola no próximo login.
async function handleResetTwoFactor() {
  const user = userToReset2fa.value;
  if (!user) return;
  isReset2fa.value = true;
  try {
    await userApi.resetTwoFactor(user.id);
    await fetchData();
    userToReset2fa.value = null;
    showAlert(
      '2FA reiniciado',
      `${user.email} vai configurar um autenticador novo no próximo login. As sessões abertas foram encerradas.`,
      'info',
    );
  } catch (error: unknown) {
    console.error(error);
    userToReset2fa.value = null;
    showAlert('Erro', 'Não foi possível reiniciar o 2FA deste usuário.', 'error');
  } finally {
    isReset2fa.value = false;
  }
}

// --- reset de senha ---
async function handleConfirmResetPassword() {
  const user = userToReset.value;
  if (!user) return;
  try {
    isResetting.value = user.id;
    const emailHtml = ResetPasswordEmail({
      email: user.email,
      appName: app.value?.nome || 'nossa plataforma',
      loginUrl: app.value?.platform_url || undefined,
      magicLinkToken: '__MAGIC_LINK__',
      appLogo: app.value?.logo,
    });

    const res = await userApi.resetPassword(user.id, emailHtml);
    userToReset.value = null;

    if (res.emailSent) {
      showAlert('Acesso redefinido', `Um link para definição de senha foi enviado por e-mail para ${user.email}.`, 'info');
    } else if (res.magicLinkToken) {
      mostrarLinkManual('Acesso redefinido (envio falhou)', res.magicLinkToken);
    } else {
      showAlert('Acesso redefinido', 'Link de redefinição gerado com sucesso.', 'info');
    }
  } catch (error: unknown) {
    console.error(error);
    userToReset.value = null;
    showAlert('Erro', 'Não foi possível resetar a senha deste usuário.', 'error');
  } finally {
    isResetting.value = null;
  }
}

function aoConvidar({ email, emailSent, magicLinkToken }: { email: string; emailSent: boolean; magicLinkToken?: string }) {
  void fetchData();
  showFormModal.value = false;
  if (emailSent) showAlert('Convite enviado', `O convite foi enviado por e-mail para ${email}.`, 'info');
  else if (magicLinkToken) mostrarLinkManual('Convite gerado (envio falhou)', magicLinkToken);
  else showSuccessModal.value = true;
}

function aoEditar() {
  void fetchData();
  showAlert('Sucesso', 'Dados do usuário atualizados com sucesso.', 'info');
}

async function copiarLink() {
  try {
    await navigator.clipboard.writeText(credentialsAlert.value.message);
    copiado.value = true;
  } catch {
    /* sem permissão: o texto continua selecionável na caixa */
  }
}

// Ação escolhida na folha do celular: fecha a folha e abre o passo seguinte.
function acao(fn: (u: User) => void) {
  const u = userAcoes.value;
  userAcoes.value = null;
  if (u) fn(u);
}

const iniciais = (nome: string) => nome.charAt(0).toUpperCase();
</script>

<template>
  <div class="animate-fade-in space-y-8">
    <UiNavBar :titulo="app?.nome || 'Usuários'" voltar="/dashboard" voltar-texto="Aplicativos">
      <template #subtitulo>
        Gestão de usuários<template v-if="!loading"> · {{ users.length }} {{ users.length === 1 ? 'usuário' : 'usuários' }}</template>
      </template>
      <template #acoes>
        <UiButton tamanho="small" @click="showFormModal = true">
          <UserPlusIcon class="h-5 w-5" />
          <span class="hidden sm:inline">Convidar usuário</span>
          <span class="sm:hidden">Convidar</span>
        </UiButton>
      </template>
    </UiNavBar>

    <!-- Apps que só recebem convite (usa_login_hub = false) não autenticam
         aqui — o Cofre é o caso. Sem este aviso, a coluna "2FA" da lista
         sugere que o segundo fator protege o app, e não protege: a pessoa
         nunca passa pelo login do hub, então nunca enrola. -->
    <div v-if="app && app.usaLoginHub === false" class="rounded-celula bg-warning/10 p-4">
      <p class="flex items-center gap-2 text-headline font-semibold text-warning">
        <ShieldExclamationIcon class="h-6 w-6 shrink-0" />
        O 2FA do LoginHUB não vale para este aplicativo
      </p>
      <p class="mt-2 text-subhead text-label-2">
        Aqui o hub <strong class="text-label">só emite o convite</strong>. Quem entra em
        <span class="font-medium text-label">{{ app.nome }}</span> não passa pelo login do LoginHUB, então nunca chega a
        configurar o segundo fator — por isso ele fica desligado por padrão nestas contas, em vez de mostrar um
        “pendente” que nunca resolve.
      </p>
      <p class="mt-2 text-subhead text-label-2">
        A senha destas contas <strong class="text-label">não abre nada aqui</strong>: o login do hub é recusado para
        elas. A proteção do app é a senha mestra que a pessoa define no próprio {{ app.nome }} — o hub não a conhece e
        não consegue recuperá-la.
      </p>
    </div>

    <!-- Vínculo com a API do próprio app, quando existe. Aqui o convite pode não
         nascer no hub: quem cria o usuário é o backend do app. -->
    <IntegrationLink v-if="temIntegracao" :app-id="id" :app-name="app?.nome" />

    <!-- Vínculo com OUTRO app cliente. Aqui na tela do convite porque é onde a
         confusão nasce: convidar não liga a pessoa ao outro app. -->
    <AppLinkPanel v-if="temVinculo" :app-id="id" />

    <!-- Lista negra do login do app (28/10/2026): quem o hub barrou por
         tentativas demais, com o Liberar — o app dono tem a mesma lista. -->
    <BloqueiosPanel v-if="app && app.usaLoginHub !== false" :app-id="id" />

    <UiSection titulo="Usuários" lista>
      <template #acao>
        <span v-if="busca && !loading" class="text-footnote text-label-2">{{ filtrados.length }} de {{ users.length }}</span>
      </template>

      <div v-if="users.length > 0" class="px-4 py-3">
        <UiSearchField v-model="busca" placeholder="Buscar por nome, e-mail ou telefone" />
      </div>

      <div v-if="loading" class="flex flex-col items-center gap-3 px-4 py-12 text-label-2">
        <UiSpinner class="h-8 w-8 text-accent" />
        <p class="text-subhead">Sincronizando dados…</p>
      </div>

      <UiEmpty
        v-else-if="users.length === 0"
        :icone="UserIcon"
        titulo="Nenhum usuário"
        texto="Ninguém vinculado a este aplicativo ainda."
      >
        <UiButton variante="tinted" @click="showFormModal = true"><UserPlusIcon class="h-5 w-5" /> Convidar usuário</UiButton>
      </UiEmpty>

      <UiEmpty v-else-if="filtrados.length === 0" titulo="Nada encontrado" :texto="`Nenhum usuário bate com “${busca}”.`" />

      <template v-else>
        <!-- celular: lista agrupada, ações na folha do ⋯ -->
        <div v-for="user in filtrados" :key="`m-${user.id}`" class="flex items-center gap-3 px-4 py-3 md:hidden">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fill text-headline font-semibold text-label-2">
            {{ iniciais(user.nome) }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-body font-medium">{{ user.nome }}</p>
            <p class="truncate text-subhead text-label-2">{{ user.email }}</p>
            <div class="mt-1.5 flex flex-wrap gap-1.5">
              <UiBadge v-if="user.status === 'ativo'" tom="success">Ativo</UiBadge>
              <UiBadge v-else tom="danger">Bloqueado</UiBadge>
              <UiBadge v-if="user.role === 'admin'" tom="indigo"><ShieldCheckIcon class="h-3 w-3" /> Admin</UiBadge>
              <UiBadge v-else-if="user.role === 'operador'" tom="warning">Operador</UiBadge>
              <UiBadge v-else>Usuário</UiBadge>
              <UiBadge v-if="ehDoRoster(user)" tom="accent">{{ rosterCfg?.label }}</UiBadge>
              <UiBadge v-if="app?.usaLoginHub === false">2FA não se aplica</UiBadge>
              <UiBadge v-else-if="user.dois_fatores?.ativo" tom="success"><DevicePhoneMobileIcon class="h-3 w-3" /> 2FA</UiBadge>
              <UiBadge v-else tom="warning">2FA pendente</UiBadge>
            </div>
          </div>
          <UiButton variante="plain" icone :aria-label="`Ações de ${user.nome}`" @click="userAcoes = user">
            <EllipsisHorizontalIcon class="h-6 w-6" />
          </UiButton>
        </div>

        <!-- desktop: tabela -->
        <div class="hidden overflow-x-auto md:block">
          <table class="min-w-full">
            <thead>
              <tr class="text-left text-footnote font-medium text-label-2">
                <th class="px-4 py-2.5 font-medium">Nome</th>
                <th class="px-4 py-2.5 font-medium">Acesso</th>
                <th class="px-4 py-2.5 font-medium">Contato</th>
                <th class="px-4 py-2.5 font-medium">Status</th>
                <th class="px-4 py-2.5 font-medium">2FA</th>
                <th class="px-4 py-2.5 text-right font-medium"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody class="divide-y border-t">
              <tr v-for="user in filtrados" :key="user.id" class="transition-colors hover:bg-fill-2">
                <td class="whitespace-nowrap px-4 py-3">
                  <div class="flex items-center gap-3">
                    <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fill text-subhead font-semibold text-label-2">
                      {{ iniciais(user.nome) }}
                    </span>
                    <div class="min-w-0">
                      <p class="text-subhead font-medium">{{ user.nome }}</p>
                      <p class="text-footnote text-label-2">{{ user.email }}</p>
                    </div>
                  </div>
                </td>
                <td class="whitespace-nowrap px-4 py-3">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <UiBadge v-if="user.role === 'admin'" tom="indigo"><ShieldCheckIcon class="h-3 w-3" /> Admin</UiBadge>
                    <UiBadge v-else-if="user.role === 'operador'" tom="warning">Operador</UiBadge>
                    <UiBadge v-else>Usuário</UiBadge>
                    <UiBadge v-if="ehDoRoster(user)" tom="accent">{{ rosterCfg?.label }}</UiBadge>
                  </div>
                </td>
                <td class="whitespace-nowrap px-4 py-3 text-subhead text-label-2">{{ user.telefone || '—' }}</td>
                <td class="whitespace-nowrap px-4 py-3">
                  <StatusButton
                    :status="user.status === 'ativo' ? 'ativo' : 'inativo'"
                    :nome="user.nome"
                    @alternar="handleToggleStatus(user)"
                  />
                </td>
                <td class="whitespace-nowrap px-4 py-3">
                  <!-- "Pendente" seria falso aqui: não há login no hub para cair
                       no enrolamento. Dizer "não se aplica" é o estado verdadeiro. -->
                  <UiBadge v-if="app?.usaLoginHub === false" title="Este app não autentica pelo LoginHUB — o hub só emitiu o convite.">
                    não se aplica
                  </UiBadge>
                  <UiBadge v-else-if="user.dois_fatores?.ativo" tom="success"><DevicePhoneMobileIcon class="h-3 w-3" /> Ativo</UiBadge>
                  <UiBadge v-else tom="warning" title="Exigido, mas ainda não configurado. A conta cai no enrolamento no próximo login.">
                    Pendente
                  </UiBadge>
                </td>
                <td class="whitespace-nowrap px-4 py-3">
                  <div class="flex justify-end gap-1">
                    <button
                      v-if="user.dois_fatores?.ativo"
                      type="button"
                      class="flex h-9 w-9 items-center justify-center rounded-full text-label-2 hover:bg-accent/10 hover:text-accent"
                      title="Reiniciar 2FA (perdeu o celular)"
                      aria-label="Reiniciar 2FA"
                      @click="userToReset2fa = user"
                    >
                      <DevicePhoneMobileIcon class="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      class="flex h-9 w-9 items-center justify-center rounded-full text-label-2 hover:bg-warning/10 hover:text-warning disabled:opacity-40"
                      title="Resetar senha"
                      aria-label="Resetar senha"
                      :disabled="isResetting === user.id"
                      @click="userToReset = user"
                    >
                      <KeyIcon class="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      class="flex h-9 w-9 items-center justify-center rounded-full text-label-2 hover:bg-accent/10 hover:text-accent"
                      title="Editar usuário"
                      aria-label="Editar usuário"
                      @click="userToEdit = user"
                    >
                      <PencilSquareIcon class="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      class="flex h-9 w-9 items-center justify-center rounded-full text-label-2 hover:bg-danger/10 hover:text-danger"
                      title="Remover usuário"
                      aria-label="Remover usuário"
                      @click="userToDelete = user"
                    >
                      <TrashIcon class="h-5 w-5" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </UiSection>

    <!-- FOLHA DE AÇÕES (celular) -->
    <UiSheet :aberto="!!userAcoes" :titulo="userAcoes?.nome || ''" :subtitulo="userAcoes?.email" largura="sm" @fechar="userAcoes = null">
      <div v-if="userAcoes" class="space-y-6">
        <UiSection lista>
          <UiRow clicavel titulo="Editar dados" @click="acao((u) => (userToEdit = u))">
            <template #icone><PencilSquareIcon class="text-accent" /></template>
          </UiRow>
          <UiRow clicavel titulo="Resetar senha" subtitulo="Envia um link novo por e-mail" @click="acao((u) => (userToReset = u))">
            <template #icone><KeyIcon class="text-warning" /></template>
          </UiRow>
          <UiRow
            v-if="userAcoes.dois_fatores?.ativo"
            clicavel
            titulo="Reiniciar 2FA"
            subtitulo="Perdeu o celular e os códigos"
            @click="acao((u) => (userToReset2fa = u))"
          >
            <template #icone><DevicePhoneMobileIcon class="text-accent" /></template>
          </UiRow>
          <UiRow
            clicavel
            :titulo="userAcoes.status === 'ativo' ? 'Bloquear usuário' : 'Desbloquear usuário'"
            @click="acao((u) => (userParaStatus = u))"
          >
            <template #icone>
              <LockClosedIcon v-if="userAcoes.status === 'ativo'" class="text-danger" />
              <LockOpenIcon v-else class="text-success" />
            </template>
          </UiRow>
        </UiSection>
        <UiSection lista>
          <UiRow clicavel @click="acao((u) => (userToDelete = u))">
            <template #icone><TrashIcon class="text-danger" /></template>
            <span class="text-body text-danger">Remover usuário</span>
          </UiRow>
        </UiSection>
      </div>
    </UiSheet>

    <!-- FOLHAS DE FORMULÁRIO -->
    <CreateUserSheet
      :aberto="showFormModal"
      :app-id="id"
      :app-name="app?.nome"
      :app-bot-url="app?.bot_url"
      :app-platform-url="app?.platform_url"
      :app-logo="app?.logo"
      @fechar="showFormModal = false"
      @sucesso="aoConvidar"
    />

    <EditUserSheet :aberto="!!userToEdit" :user="userToEdit" :app-id="id" @fechar="userToEdit = null" @sucesso="aoEditar" />

    <!-- ALERTAS -->
    <UiAlert
      :aberto="showSuccessModal"
      tom="success"
      titulo="Usuário criado"
      mensagem="O usuário foi adicionado com sucesso e já pode acessar o sistema."
      confirmar="Continuar"
      :cancelar="null"
      @fechar="showSuccessModal = false"
    />

    <UiAlert
      :aberto="!!userToDelete"
      tom="danger"
      :icone="TrashIcon"
      titulo="Remover usuário?"
      mensagem="Esta ação é irreversível."
      :destaque="userToDelete?.nome"
      confirmar="Remover"
      :carregando="isDeleting"
      texto-carregando="Removendo…"
      @fechar="userToDelete = null"
      @confirmar="handleConfirmDelete"
    />

    <UiAlert
      :aberto="!!userToReset"
      tom="warning"
      :icone="KeyIcon"
      titulo="Resetar senha do usuário"
      mensagem="Um link de acesso será gerado e enviado por e-mail para o usuário. Através deste link, ele deverá definir uma nova senha definitiva."
      :destaque="userToReset ? `${userToReset.nome} — ${userToReset.email}` : undefined"
      confirmar="Gerar novo link"
      :carregando="!!userToReset && isResetting === userToReset.id"
      texto-carregando="Gerando…"
      @fechar="userToReset = null"
      @confirmar="handleConfirmResetPassword"
    />

    <UiAlert
      :aberto="!!userToReset2fa"
      tom="warning"
      :icone="DevicePhoneMobileIcon"
      titulo="Reiniciar o 2FA?"
      mensagem="O autenticador atual é descartado e as sessões abertas caem. No próximo login a pessoa configura um novo — o 2FA continua obrigatório."
      :destaque="userToReset2fa?.email"
      confirmar="Reiniciar"
      :carregando="isReset2fa"
      texto-carregando="Reiniciando…"
      @fechar="userToReset2fa = null"
      @confirmar="handleResetTwoFactor"
    />

    <UiAlert
      :aberto="!!userParaStatus"
      :tom="userParaStatus?.status === 'ativo' ? 'danger' : 'success'"
      :icone="userParaStatus?.status === 'ativo' ? LockClosedIcon : LockOpenIcon"
      :titulo="userParaStatus?.status === 'ativo' ? 'Bloquear acesso?' : 'Reativar acesso?'"
      :mensagem="
        userParaStatus?.status === 'ativo'
          ? 'Perde o acesso à plataforma na hora, até ser reativado.'
          : 'Poderá fazer login de novo imediatamente.'
      "
      :destaque="userParaStatus?.nome"
      :confirmar="userParaStatus?.status === 'ativo' ? 'Bloquear' : 'Reativar'"
      @fechar="userParaStatus = null"
      @confirmar="userParaStatus && handleToggleStatus(userParaStatus)"
    />

    <UiAlert
      :aberto="alertState.isOpen"
      :tom="TOM_ALERTA[alertState.variant]"
      :titulo="alertState.title"
      :mensagem="alertState.message"
      confirmar="Entendi"
      :cancelar="null"
      @fechar="alertState.isOpen = false"
    />

    <!-- LINK MANUAL (o e-mail não saiu) -->
    <UiSheet :aberto="credentialsAlert.isOpen" :titulo="credentialsAlert.title" @fechar="credentialsAlert.isOpen = false">
      <div class="space-y-3">
        <textarea
          readonly
          :value="credentialsAlert.message"
          rows="7"
          aria-label="Link de acesso"
          class="block w-full resize-none rounded-controle border-0 bg-fill-2 p-3 font-mono text-subhead text-label outline-none"
          @focus="($event.target as HTMLTextAreaElement).select()"
        />
        <p class="flex items-start gap-2 rounded-celula bg-warning/10 p-3 text-footnote text-label">
          <KeyIcon class="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          Guarde este link e repasse só para a pessoa: ele dá acesso à conta e vale uma vez só.
        </p>
      </div>
      <template #acoes>
        <UiButton variante="gray" @click="copiarLink">
          <ClipboardDocumentIcon class="h-5 w-5" />
          {{ copiado ? 'Copiado' : 'Copiar' }}
        </UiButton>
        <UiButton @click="credentialsAlert.isOpen = false">Entendi</UiButton>
      </template>
    </UiSheet>
  </div>
</template>
