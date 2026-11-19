<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import axios from 'axios';
import { CheckBadgeIcon, ClockIcon, EnvelopeIcon, TrashIcon, UserIcon, UserPlusIcon } from '@heroicons/vue/24/outline';
import { organizacaoApi } from '@loginhub/api-client';
import type { AdminOrganizacao } from '@loginhub/schema';
import UiSheet from '@/components/ui/UiSheet.vue';
import UiAlert from '@/components/ui/UiAlert.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiTextField from '@/components/ui/UiTextField.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiSpinner from '@/components/ui/UiSpinner.vue';

/**
 * "Convidar admin" (19/11/2026, db/012): quem cuida de cada organização.
 *
 * O convidado recebe o e-mail de convite do hub, cria a senha, ativa o Google
 * Authenticator e entra no painel pela aba "Administrador" do login — vendo só
 * os apps da organização, onde pode gerir usuários e convidar outros admins.
 */
const props = defineProps<{
  aberto: boolean;
  organizacoes: Array<{ id: number; nome: string }>;
  /** Organização já escolhida (o botão do cabeçalho do grupo manda a dele). */
  inicial?: number | null;
  /** E-mail de quem está usando o painel: não mostra "remover" para si mesmo. */
  meuEmail?: string;
}>();
const emit = defineEmits<{ fechar: [] }>();

const organizacaoId = ref('');
const admins = ref<AdminOrganizacao[]>([]);
const carregando = ref(false);
const nome = ref('');
const email = ref('');
const enviando = ref(false);
const erro = ref<string | null>(null);
const aviso = ref<string | null>(null);
const linkManual = ref<string | null>(null);
const paraRemover = ref<AdminOrganizacao | null>(null);
const removendo = ref(false);

const opcoes = computed(() => props.organizacoes.map((o) => ({ valor: String(o.id), rotulo: o.nome })));
const orgAtual = computed(() => props.organizacoes.find((o) => String(o.id) === organizacaoId.value) ?? null);

const mensagemDe = (e: unknown, padrao: string) =>
  axios.isAxiosError(e) && e.response?.data?.message ? String(e.response.data.message) : padrao;

async function carregar() {
  if (!organizacaoId.value) {
    admins.value = [];
    return;
  }
  carregando.value = true;
  try {
    admins.value = await organizacaoApi.admins(Number(organizacaoId.value));
  } catch (e) {
    console.error(e);
    erro.value = mensagemDe(e, 'Não foi possível carregar os admins.');
  } finally {
    carregando.value = false;
  }
}

watch(
  () => props.aberto,
  (aberto) => {
    if (!aberto) return;
    erro.value = null;
    aviso.value = null;
    linkManual.value = null;
    nome.value = '';
    email.value = '';
    const inicial = props.inicial ?? props.organizacoes[0]?.id ?? null;
    organizacaoId.value = inicial === null ? '' : String(inicial);
    void carregar();
  },
  { immediate: true },
);

watch(organizacaoId, () => {
  aviso.value = null;
  linkManual.value = null;
  void carregar();
});

async function convidar() {
  if (!orgAtual.value) return;
  enviando.value = true;
  erro.value = null;
  aviso.value = null;
  linkManual.value = null;
  try {
    const r = await organizacaoApi.convidar(orgAtual.value.id, { nome: nome.value.trim(), email: email.value.trim() });
    if (!r.contaNova) aviso.value = `${r.admin.nome} já tinha conta no painel e agora também cuida de ${orgAtual.value.nome}.`;
    else if (r.emailSent) aviso.value = `Convite enviado para ${r.admin.email}.`;
    else {
      aviso.value = 'A conta foi criada, mas o e-mail não saiu. Entregue este link à pessoa:';
      if (r.magicLinkToken) linkManual.value = `${window.location.origin}/setup-password?token=${r.magicLinkToken}`;
    }
    nome.value = '';
    email.value = '';
    await carregar();
  } catch (e) {
    console.error(e);
    erro.value = mensagemDe(e, 'Não foi possível convidar.');
  } finally {
    enviando.value = false;
  }
}

async function remover() {
  const alvo = paraRemover.value;
  if (!alvo || !orgAtual.value) return;
  removendo.value = true;
  try {
    await organizacaoApi.remover(orgAtual.value.id, alvo.usuario_id);
    paraRemover.value = null;
    await carregar();
  } catch (e) {
    console.error(e);
    paraRemover.value = null;
    erro.value = mensagemDe(e, 'Não foi possível remover.');
  } finally {
    removendo.value = false;
  }
}

const desde = (d: string | Date) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
</script>

<template>
  <UiSheet
    :aberto="aberto"
    titulo="Admins da organização"
    subtitulo="Quem cuida dos apps, dos usuários e dos convites de cada organização."
    :bloqueado="enviando"
    @fechar="emit('fechar')"
  >
    <div class="space-y-6">
      <UiSelect v-if="opcoes.length > 1" v-model="organizacaoId" rotulo="Organização" :opcoes="opcoes" />
      <p v-else-if="orgAtual" class="text-subhead text-label-2">
        Organização: <strong class="text-label">{{ orgAtual.nome }}</strong>
      </p>
      <p v-else class="text-subhead text-label-2">Nenhuma organização cadastrada. Crie uma categoria primeiro.</p>

      <!-- Convidar -->
      <form v-if="orgAtual" class="space-y-3 rounded-celula bg-fill-2 p-4" @submit.prevent="convidar">
        <p class="flex items-center gap-2 text-headline font-semibold">
          <UserPlusIcon class="h-5 w-5 text-accent" />
          Convidar admin
        </p>
        <UiTextField v-model="nome" rotulo="Nome" placeholder="Nome da pessoa" autocomplete="off" required>
          <template #icone><UserIcon /></template>
        </UiTextField>
        <UiTextField v-model="email" rotulo="E-mail" type="email" inputmode="email" placeholder="pessoa@empresa.com" autocomplete="off" required>
          <template #icone><EnvelopeIcon /></template>
        </UiTextField>
        <p class="text-footnote text-label-2">
          A pessoa recebe o convite por e-mail, cria a senha e ativa o Google Authenticator. Depois entra aqui pela aba
          <strong>Administrador</strong> e vê só os apps de {{ orgAtual.nome }}.
        </p>
        <UiButton type="submit" bloco :carregando="enviando" :disabled="!nome.trim() || !email.trim()">
          {{ enviando ? 'Enviando…' : 'Enviar convite' }}
        </UiButton>
      </form>

      <p v-if="erro" role="alert" class="rounded-celula bg-danger/10 p-3 text-subhead text-danger">{{ erro }}</p>
      <div v-if="aviso" role="status" class="rounded-celula bg-accent/10 p-3 text-subhead text-label">
        {{ aviso }}
        <p v-if="linkManual" class="mt-2 break-all font-mono text-footnote select-all">{{ linkManual }}</p>
      </div>

      <!-- Lista -->
      <div v-if="orgAtual">
        <p class="mb-2 text-footnote font-medium uppercase tracking-wide text-label-2">Admins de {{ orgAtual.nome }}</p>
        <div v-if="carregando" class="flex justify-center py-6 text-label-2"><UiSpinner class="h-6 w-6" /></div>
        <p v-else-if="admins.length === 0" class="py-3 text-subhead italic text-label-2">
          Ninguém ainda. Só o master cuida desta organização.
        </p>
        <ul v-else class="divide-y rounded-celula bg-surface [&>*]:border-separator">
          <li v-for="a in admins" :key="a.usuario_id" class="flex items-center gap-3 px-3 py-3">
            <div class="min-w-0 flex-1">
              <p class="flex flex-wrap items-center gap-2 text-subhead font-semibold">
                <span class="truncate">{{ a.nome }}</span>
                <UiBadge v-if="a.dois_fatores_ativo" tom="success" title="Senha e Google Authenticator configurados">
                  <CheckBadgeIcon class="h-3 w-3" /> ativo
                </UiBadge>
                <UiBadge v-else tom="warning" title="Ainda não abriu o convite (senha + Google Authenticator)">
                  <ClockIcon class="h-3 w-3" /> convite pendente
                </UiBadge>
                <UiBadge v-if="a.status !== 'ativo'" tom="danger">{{ a.status }}</UiBadge>
              </p>
              <p class="truncate text-footnote text-label-2">{{ a.email }}</p>
              <p class="text-caption-1 text-label-2">desde {{ desde(a.criado_em) }} · convidado por {{ a.convidado_por }}</p>
            </div>
            <UiButton
              v-if="a.email !== meuEmail"
              variante="plain"
              icone
              class="!text-danger hover:!bg-danger/10"
              :aria-label="`Tirar ${a.nome} da organização`"
              title="Tirar da organização"
              @click="paraRemover = a"
            >
              <TrashIcon class="h-5 w-5" />
            </UiButton>
          </li>
        </ul>
      </div>
    </div>

    <UiAlert
      :aberto="!!paraRemover"
      tom="danger"
      :icone="TrashIcon"
      titulo="Tirar da organização?"
      :destaque="paraRemover?.nome"
      confirmar="Tirar"
      :carregando="removendo"
      texto-carregando="Removendo…"
      @fechar="paraRemover = null"
      @confirmar="remover"
    >
      A pessoa perde na hora o acesso aos apps de <strong>{{ orgAtual?.nome }}</strong> no painel. A conta dela continua existindo
      e pode ser convidada de novo.
    </UiAlert>
  </UiSheet>
</template>
