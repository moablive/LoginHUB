<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { UserIcon } from '@heroicons/vue/24/outline';
import { authApi, cofreApi } from '@loginhub/api-client';
import AuthShell from '@/components/AuthShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiTextField from '@/components/ui/UiTextField.vue';
import UiSegmented from '@/components/ui/UiSegmented.vue';
import TwoFactorChallenge from '@/features/twoFactor/TwoFactorChallenge.vue';
import { aparelhoAtual } from '@/features/aparelho';
import CofrePage from './CofrePage.vue';

/**
 * /meu-cofre (19/11/2026, db/014): o cofre de senhas de quem é usuário de um
 * app com o cofre liberado (um DJ da Astral Wave, por exemplo). Entra com a
 * MESMA conta do app (CPF ou e-mail + senha + Google Authenticator); depois o cofre
 * pede a palavra-passe dele, que só ele sabe. Cada pessoa tem o seu.
 *
 * 21/11/2026: é a aba "Meu cofre" da tela de login (mesmo controle segmentado
 * do /login), para quem entra pelo endereço do hub achar o próprio cofre.
 *
 * 24/11/2026 (pedido do dono): entra também com o CPF — funcionário da Sul
 * Alimentos usa CPF + CPF + Google Authenticator. O campo aceita os dois; CPF
 * digitado com pontos e traço vira só dígitos. O login manda o aparelho deste
 * navegador e a marca do cofre: a conta de CPF ocupa a vaga `cofre` (db/019) e
 * não briga com o celular em que a pessoa usa o app.
 */
/** CPF (com ou sem pontos e traço) vira só dígitos; e-mail vai em minúsculas. */
const identificador = (bruto: string): string => {
  const limpo = bruto.trim();
  return /^[\d.\-\s]+$/.test(limpo) ? limpo.replace(/\D/g, '') : limpo.toLowerCase();
};
/** Quem entra com o CPF tem o próprio CPF como senha: com pontos e traço, vira só dígitos. */
const senhaNormalizada = (bruta: string): string => {
  const limpo = bruta.trim();
  if (!/^[\d.\-\s]+$/.test(limpo)) return bruta;
  const digitos = limpo.replace(/\D/g, '');
  return /^\d{11}$/.test(digitos) ? digitos : bruta;
};
const router = useRouter();
const aba = ref<'admin' | 'cofre' | 'master'>('cofre');
const ABAS = [
  { valor: 'admin' as const, rotulo: 'Admin' },
  { valor: 'cofre' as const, rotulo: 'Meu cofre' },
  { valor: 'master' as const, rotulo: 'Master Key' },
];
function trocarAba(v: 'admin' | 'cofre' | 'master') {
  if (v === 'cofre') return;
  void router.push(v === 'master' ? { path: '/login', query: { modo: 'master' } } : '/login');
}
const etapa = ref<'carregando' | 'login' | 'desafio' | 'cofre'>('carregando');
const email = ref('');
const senha = ref('');
const desafio = ref<string | null>(null);
const apps = ref<Array<{ id: string; nome: string }>>([]);
const erro = ref<string | null>(null);
const enviando = ref(false);

function mensagem(e: unknown, padrao: string): string {
  if (axios.isAxiosError(e)) {
    const d = e.response?.data as { error?: string; message?: string } | undefined;
    if (d?.error === 'COFRE_NAO_LIBERADO') return d.message || 'O cofre não está liberado para o seu aplicativo.';
    if (e.response?.status === 401) return 'CPF/e-mail ou senha incorretos. Quem entra com o CPF usa o próprio CPF como senha (só os números).';
    if (d?.message) return d.message;
  }
  return padrao;
}

/** A sessão que está no navegador abre o cofre? (app liberado) */
async function conferirSessao(): Promise<boolean> {
  try {
    await cofreApi.estado();
    return true;
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 403) erro.value = mensagem(e, 'O cofre não está liberado para o seu aplicativo.');
    return false;
  }
}

onMounted(async () => {
  etapa.value = localStorage.getItem('awl_token') && (await conferirSessao()) ? 'cofre' : 'login';
});

async function entrar(appId?: string) {
  erro.value = null;
  enviando.value = true;
  try {
    const r = await authApi.login(identificador(email.value), senhaNormalizada(senha.value), appId, { aparelho: aparelhoAtual() });
    apps.value = [];
    if (r.require2FASetup) {
      erro.value = 'Esta conta ainda não tem o Google Authenticator configurado. Configure primeiro no seu aplicativo (ou pelo convite) e volte aqui.';
      return;
    }
    if (r.requires2FA && r.challengeToken) {
      desafio.value = r.challengeToken;
      etapa.value = 'desafio';
      return;
    }
    await aposLogin();
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.data?.error === 'AMBIGUOUS_EMAIL') {
      apps.value = e.response.data.availableApps ?? [];
      erro.value = 'Esta conta existe em mais de um aplicativo. Escolha qual:';
      return;
    }
    erro.value = mensagem(e, 'Não foi possível entrar.');
  } finally {
    enviando.value = false;
  }
}

async function aposLogin() {
  desafio.value = null;
  senha.value = '';
  if (await conferirSessao()) etapa.value = 'cofre';
  else {
    localStorage.removeItem('awl_token');
    etapa.value = 'login';
  }
}

function sair() {
  localStorage.removeItem('awl_token');
  localStorage.removeItem('awl_user');
  localStorage.removeItem('awl_app');
  etapa.value = 'login';
}
</script>

<template>
  <div v-if="etapa === 'carregando'" class="min-h-screen bg-canvas" />

  <AuthShell v-else-if="etapa === 'desafio' && desafio" titulo="Verificação em duas etapas" texto="Informe o código do Google Authenticator.">
    <TwoFactorChallenge :challenge-token="desafio" pode-cancelar @autenticado="aposLogin" @cancelar="(etapa = 'login'), (desafio = null)" />
  </AuthShell>

  <AuthShell
    v-else-if="etapa === 'login'"
    titulo="LoginHub"
    texto="Entre com o CPF ou o e-mail da conta do seu aplicativo. Depois, o cofre pede a sua palavra-passe — só você a sabe."
  >
    <UiSegmented v-model="aba" :opcoes="ABAS" rotulo="Tipo de acesso" class="mb-5" @update:model-value="trocarAba" />
    <form class="space-y-4" @submit.prevent="entrar()">
      <UiTextField v-model="email" rotulo="CPF ou e-mail" type="text" placeholder="CPF (só números) ou e-mail" autocomplete="username" autocapitalize="none" spellcheck="false" required>
        <template #icone><UserIcon /></template>
      </UiTextField>
      <UiTextField v-model="senha" rotulo="Senha" type="password" revelar autocomplete="current-password" required />
      <p v-if="erro" role="alert" class="rounded-celula bg-danger/10 p-3 text-subhead text-danger">{{ erro }}</p>
      <div v-if="apps.length" class="space-y-2">
        <UiButton v-for="a in apps" :key="a.id" variante="tinted" bloco :carregando="enviando" @click="entrar(a.id)">{{ a.nome }}</UiButton>
      </div>
      <UiButton v-else type="submit" tamanho="large" bloco :carregando="enviando" :disabled="!email || !senha">Entrar</UiButton>
    </form>
    <template #rodape>&copy; 2026 Astral Wave · LoginHub</template>
  </AuthShell>

  <div v-else class="min-h-screen min-h-dvh bg-canvas text-label">
    <main class="mx-auto w-full max-w-[1200px] px-4 pb-28 sm:px-6 lg:px-8">
      <CofrePage modo="usuario" @sair="sair" />
    </main>
  </div>
</template>
