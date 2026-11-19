<script setup lang="ts">
import { onMounted, ref } from 'vue';
import axios from 'axios';
import { EnvelopeIcon, LockClosedIcon } from '@heroicons/vue/24/outline';
import { authApi, cofreApi } from '@loginhub/api-client';
import AuthShell from '@/components/AuthShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiTextField from '@/components/ui/UiTextField.vue';
import TwoFactorChallenge from '@/features/twoFactor/TwoFactorChallenge.vue';
import CofrePage from './CofrePage.vue';

/**
 * /meu-cofre (19/11/2026, db/014): o cofre de senhas de quem é usuário de um
 * app com o cofre liberado (um DJ da Astral Wave, por exemplo). Entra com a
 * MESMA conta do app (e-mail + senha + Google Authenticator); depois o cofre
 * pede a palavra-passe dele, que só ele sabe. Cada pessoa tem o seu.
 */
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
    if (e.response?.status === 401) return 'E-mail ou senha incorretos.';
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
    const r = await authApi.login(email.value.trim().toLowerCase(), senha.value, appId);
    apps.value = [];
    if (r.require2FASetup) {
      erro.value = 'Termine primeiro o convite da sua conta (senha + Google Authenticator) e volte aqui.';
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
      erro.value = 'Este e-mail tem conta em mais de um aplicativo. Escolha qual:';
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
    titulo="Meu cofre"
    :icone="LockClosedIcon"
    texto="Entre com a conta do seu aplicativo. Depois, o cofre pede a sua palavra-passe — só você a sabe."
  >
    <form class="space-y-4" @submit.prevent="entrar()">
      <UiTextField v-model="email" rotulo="E-mail" type="email" inputmode="email" autocomplete="username" required>
        <template #icone><EnvelopeIcon /></template>
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
