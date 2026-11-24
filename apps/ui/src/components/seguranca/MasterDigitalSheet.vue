<script setup lang="ts">
import { ref, watch } from 'vue';
import axios from 'axios';
import { FingerPrintIcon } from '@heroicons/vue/24/outline';
import { masterDigitalApi, type DigitalDoMaster } from '@loginhub/api-client';
import UiAlert from '@/components/ui/UiAlert.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiSheet from '@/components/ui/UiSheet.vue';
import UiTextField from '@/components/ui/UiTextField.vue';
import { ativarDigitalDoMaster, digitalMasterSuportada, ErroDigitalMaster } from '@/features/masterDigital';

/**
 * Digital do master (24/11/2026, db/020, pedido do dono): cada aparelho do master
 * cadastra a própria digital e passa a entrar no painel com Touch ID / Face ID,
 * sem digitar a Master Key. A chave continua valendo como reserva.
 */
const props = defineProps<{ aberto: boolean }>();
const emit = defineEmits<{ fechar: [] }>();

const digitais = ref<DigitalDoMaster[]>([]);
const nome = ref('');
const erro = ref<string | null>(null);
const aviso = ref<string | null>(null);
const ocupado = ref(false);
const paraTirar = ref<DigitalDoMaster | null>(null);

const MENSAGEM: Record<ErroDigitalMaster['codigo'], string> = {
  SEM_SUPORTE: 'Este navegador não conseguiu usar a digital.',
  CANCELADO: 'A digital não foi lida: o leitor foi fechado. Tente de novo.',
  JA_CADASTRADA: 'Este aparelho já está cadastrado.',
};
const mensagemDe = (e: unknown, padrao: string): string => {
  if (e instanceof ErroDigitalMaster) return MENSAGEM[e.codigo];
  if (axios.isAxiosError(e) && e.response?.data?.message) return String(e.response.data.message);
  return padrao;
};
const dataHora = (d: string | null) =>
  d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

function nomeDoAparelho(): string {
  const ua = navigator.userAgent;
  const toque = navigator.maxTouchPoints > 1;
  const sistema = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (/Macintosh/.test(ua) && toque) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Aparelho';
  const nav = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'navegador';
  return `${sistema} · ${nav}`;
}

async function carregar() {
  try {
    digitais.value = await masterDigitalApi.listar();
  } catch (e) {
    erro.value = mensagemDe(e, 'Não foi possível listar as digitais do master.');
  }
}

async function ativar() {
  ocupado.value = true;
  erro.value = null;
  aviso.value = null;
  try {
    await ativarDigitalDoMaster(nome.value);
    aviso.value = 'Pronto: neste aparelho, a aba Master Key da tela de login passa a ter o botão Entrar com a digital.';
    await carregar();
  } catch (e) {
    erro.value = mensagemDe(e, 'Não foi possível cadastrar a digital.');
  } finally {
    ocupado.value = false;
  }
}

async function tirar() {
  const alvo = paraTirar.value;
  if (!alvo) return;
  ocupado.value = true;
  try {
    await masterDigitalApi.tirar(alvo.id);
    await carregar();
  } catch (e) {
    erro.value = mensagemDe(e, 'Não foi possível tirar a digital.');
  } finally {
    ocupado.value = false;
    paraTirar.value = null;
  }
}

watch(
  () => props.aberto,
  async (abriu) => {
    if (!abriu) return;
    erro.value = null;
    aviso.value = null;
    nome.value = nomeDoAparelho();
    await carregar();
  },
  { immediate: true },
);
</script>

<template>
  <UiSheet :aberto="aberto" titulo="Digital do master" subtitulo="Entrar no painel com Touch ID, Face ID ou digital" largura="md" :bloqueado="ocupado" @fechar="emit('fechar')">
    <div class="space-y-4">
      <div class="rounded-celula bg-fill-2 p-3 text-footnote text-label-2">
        Cada aparelho cadastra a própria digital. Depois, na tela de login, a aba Master Key mostra
        <strong class="text-label">Entrar com a digital</strong>. A Master Key continua valendo como reserva: se perder os
        aparelhos, você entra com ela e cadastra a digital de novo.
      </div>
      <p v-if="!digitalMasterSuportada()" class="rounded-celula bg-warning/10 p-3 text-subhead text-warning">Este navegador não tem passkey.</p>
      <form v-else class="space-y-3" @submit.prevent="ativar">
        <UiTextField v-model="nome" rotulo="Nome deste aparelho" maxlength="120" required />
        <UiButton type="submit" tamanho="large" bloco :carregando="ocupado">
          <FingerPrintIcon class="h-5 w-5" />Ativar a digital do master neste aparelho
        </UiButton>
      </form>
      <p v-if="aviso" class="rounded-celula bg-success/10 p-3 text-subhead text-success">{{ aviso }}</p>
      <p v-if="erro" role="alert" class="rounded-celula bg-danger/10 p-3 text-subhead text-danger">{{ erro }}</p>
      <p v-if="digitais.length === 0" class="py-3 text-subhead italic text-label-2">Nenhuma digital entra no painel ainda.</p>
      <ul v-else class="divide-y rounded-celula bg-surface [&>*]:border-separator">
        <li v-for="d in digitais" :key="d.id" class="flex items-center gap-3 px-3 py-3">
          <FingerPrintIcon class="h-6 w-6 shrink-0 text-accent" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-subhead font-semibold">{{ d.nome }}</p>
            <p class="text-caption-1 text-label-2">cadastrada {{ dataHora(d.criado_em) }} · último uso {{ dataHora(d.ultimo_uso) }}</p>
          </div>
          <UiButton variante="destructive-tinted" tamanho="small" @click="paraTirar = d">Tirar</UiButton>
        </li>
      </ul>
    </div>
  </UiSheet>

  <UiAlert
    :aberto="!!paraTirar"
    tom="danger"
    titulo="Tirar esta digital?"
    :destaque="paraTirar?.nome"
    confirmar="Tirar"
    :carregando="ocupado"
    @fechar="paraTirar = null"
    @confirmar="tirar"
  >
    Este aparelho deixa de entrar no painel com a digital. A Master Key continua valendo.
  </UiAlert>
</template>
