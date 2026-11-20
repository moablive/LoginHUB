<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { EnvelopeIcon, KeyIcon, LockClosedIcon } from '@heroicons/vue/24/outline';
import { authApi, marcarAdminDeOrganizacao } from '@loginhub/api-client';
import AuthShell from '@/components/AuthShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiTextField from '@/components/ui/UiTextField.vue';
import UiSegmented from '@/components/ui/UiSegmented.vue';
import TwoFactorChallenge from '@/features/twoFactor/TwoFactorChallenge.vue';

/**
 * Duas portas para o painel (19/11/2026, admins de organização, db/012):
 *
 *   Administrador → e-mail + senha + Google Authenticator. É a conta de quem
 *                   foi convidado para cuidar de uma organização (LBS, Sul…).
 *   Master Key    → o master do hub, como sempre foi.
 */
const router = useRouter();
const route = useRoute();
/**
 * `?volta=` (19/11/2026): a entrada pelo cofre (/cofre/entrada) manda para cá
 * quando o navegador não tem sessão do hub e volta depois do login. Só caminho
 * interno da própria entrada pelo cofre: nada de mandar para outro site.
 */
const volta = (): string | null => {
  const v = typeof route.query.volta === 'string' ? route.query.volta : '';
  return v.startsWith('/cofre/entrada?') ? v : null;
};
const modo = ref<'admin' | 'master'>('admin');
const MODOS = [
  { valor: 'admin' as const, rotulo: 'Administrador' },
  { valor: 'master' as const, rotulo: 'Master Key' },
];

const email = ref('');
const senha = ref('');
const chave = ref('');
const desafio = ref<string | null>(null);
const erro = ref<string | null>(null);
const enviando = ref(false);

function mensagemDoErro(e: unknown, invalido: string): string {
  if (axios.isAxiosError(e)) {
    const status = e.response?.status;
    const msg = e.response?.data?.message;
    if (status === 423) return msg || 'Acesso bloqueado após muitas tentativas. Peça ao master para liberar.';
    if (status === 401 || status === 403) return msg && status === 403 ? msg : invalido;
    if (e.code === 'ERR_NETWORK') return 'Sem conexão com o servidor (API fora do ar).';
    return `Erro do servidor: ${e.message}`;
  }
  return e instanceof Error ? e.message : 'Ocorreu um erro inesperado. Tente novamente.';
}

async function entrarMaster() {
  erro.value = null;
  enviando.value = true;
  try {
    // A chave digitada vai inteira para o servidor, que é quem a compara com
    // a MASTER_API_KEY. O painel não conhece a chave — antes ele a tinha no
    // bundle (`VITE_MASTER_KEY`) e comparava no navegador.
    await authApi.loginMaster(chave.value);
    await router.push(volta() ?? '/dashboard');
  } catch (e: unknown) {
    console.error('Erro no login:', e);
    erro.value = mensagemDoErro(e, 'Master Key inválida ou acesso negado.');
  } finally {
    enviando.value = false;
  }
}

async function entrarAdmin() {
  erro.value = null;
  enviando.value = true;
  try {
    const r = await authApi.loginPainel(email.value, senha.value);
    if (r.requires2FA && r.challengeToken) {
      desafio.value = r.challengeToken;
      return;
    }
    await router.push(r.redirect);
  } catch (e: unknown) {
    console.error('Erro no login:', e);
    erro.value = mensagemDoErro(e, 'E-mail ou senha incorretos.');
  } finally {
    enviando.value = false;
  }
}

async function aposSegundoFator() {
  marcarAdminDeOrganizacao();
  desafio.value = null;
  await router.push('/dashboard');
}

function cancelarDesafio() {
  desafio.value = null;
  senha.value = '';
}
</script>

<template>
  <AuthShell
    v-if="desafio"
    titulo="Verificação em duas etapas"
    texto="Informe o código do Google Authenticator para entrar no painel."
  >
    <TwoFactorChallenge :challenge-token="desafio" pode-cancelar @autenticado="aposSegundoFator" @cancelar="cancelarDesafio" />
  </AuthShell>

  <AuthShell
    v-else
    titulo="LoginHub"
    :texto="modo === 'admin' ? 'Entre com a conta de administrador da sua organização.' : 'Acesso total com a Master Key.'"
  >
    <UiSegmented v-model="modo" :opcoes="MODOS" rotulo="Tipo de acesso" class="mb-5" @update:model-value="erro = null" />

    <form v-if="modo === 'admin'" class="space-y-4" @submit.prevent="entrarAdmin">
      <UiTextField v-model="email" rotulo="E-mail" type="email" placeholder="voce@empresa.com" autocomplete="username" inputmode="email" required>
        <template #icone><EnvelopeIcon /></template>
      </UiTextField>
      <UiTextField v-model="senha" rotulo="Senha" type="password" revelar placeholder="Sua senha" autocomplete="current-password" required>
        <template #icone><LockClosedIcon /></template>
      </UiTextField>

      <div v-if="erro" role="alert" class="rounded-celula bg-danger/10 p-3">
        <p class="text-subhead font-semibold text-danger">Falha na autenticação</p>
        <p class="mt-0.5 text-subhead text-danger">{{ erro }}</p>
      </div>

      <UiButton type="submit" tamanho="large" bloco :carregando="enviando" :disabled="!email || !senha">
        {{ enviando ? 'Verificando…' : 'Entrar' }}
      </UiButton>
      <p class="text-center text-footnote text-label-2">
        Recebeu um convite? Abra o link do e-mail para criar a senha e ativar o Google Authenticator.
      </p>
    </form>

    <form v-else class="space-y-4" @submit.prevent="entrarMaster">
      <UiTextField
        v-model="chave"
        rotulo="Master Key"
        rotulo-oculto
        type="password"
        revelar
        placeholder="Master Key"
        autocomplete="current-password"
        required
      >
        <template #icone><KeyIcon /></template>
      </UiTextField>

      <div v-if="erro" role="alert" class="rounded-celula bg-danger/10 p-3">
        <p class="text-subhead font-semibold text-danger">Falha na autenticação</p>
        <p class="mt-0.5 text-subhead text-danger">{{ erro }}</p>
      </div>

      <UiButton type="submit" tamanho="large" bloco :carregando="enviando" :disabled="!chave">
        {{ enviando ? 'Verificando…' : 'Acessar painel' }}
      </UiButton>
    </form>

    <template #rodape>&copy; 2026 Astral Wave · LoginHub</template>
  </AuthShell>
</template>
