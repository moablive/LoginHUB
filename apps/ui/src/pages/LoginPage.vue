<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { EnvelopeIcon, FingerPrintIcon, KeyIcon, LockClosedIcon } from '@heroicons/vue/24/outline';
import { authApi, marcarAdminDeOrganizacao, masterDigitalApi } from '@loginhub/api-client';
import AuthShell from '@/components/AuthShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiTextField from '@/components/ui/UiTextField.vue';
import UiSegmented from '@/components/ui/UiSegmented.vue';
import TwoFactorChallenge from '@/features/twoFactor/TwoFactorChallenge.vue';
import { digitalMasterSuportada, entrarComADigitalDoMaster, ErroDigitalMaster } from '@/features/masterDigital';

/**
 * Duas portas para o painel (19/11/2026, admins de organização, db/012):
 *
 *   Administrador → e-mail + senha + Google Authenticator. É a conta de quem
 *                   foi convidado para cuidar de uma organização (LBS, Sul…).
 *   Master Key    → o master do hub: pela digital do aparelho (db/020), quando
 *                   cadastrada, ou pela chave, como sempre foi.
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
const modo = ref<'admin' | 'cofre' | 'master'>(route.query.modo === 'master' ? 'master' : 'admin');
/**
 * "Meu cofre" (21/11/2026, pedido do dono): qualquer pessoa com conta num app
 * de cofre liberado entra por aqui com a PRÓPRIA conta e a própria palavra-passe.
 * A tela é a /meu-cofre — a aba só leva até ela, sem misturar com o login do painel.
 */
const MODOS = [
  { valor: 'admin' as const, rotulo: 'Admin' },
  { valor: 'cofre' as const, rotulo: 'Meu cofre' },
  { valor: 'master' as const, rotulo: 'Master Key' },
];
function trocarModo(v: 'admin' | 'cofre' | 'master') {
  erro.value = null;
  if (v === 'cofre') void router.push('/meu-cofre');
}

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

// Digital do master (24/11/2026, db/020): com alguma digital cadastrada, a aba Master Key mostra o botão em
// cima e a chave fica embaixo, como reserva.
const digitalDoMaster = ref(false);
onMounted(async () => {
  if (!digitalMasterSuportada()) return;
  try {
    digitalDoMaster.value = await masterDigitalApi.disponivel();
  } catch {
    /* sem resposta: fica só a Master Key */
  }
});
async function entrarComDigital() {
  erro.value = null;
  enviando.value = true;
  try {
    await entrarComADigitalDoMaster();
    await router.push(volta() ?? '/dashboard');
  } catch (e: unknown) {
    erro.value =
      e instanceof ErroDigitalMaster
        ? e.codigo === 'CANCELADO'
          ? 'A digital não foi lida: o leitor foi fechado ou este aparelho não tem a digital do master. Tente de novo ou use a Master Key.'
          : 'Este navegador não conseguiu usar a digital. Use a Master Key.'
        : mensagemDoErro(e, 'Não foi possível confirmar a digital. Entre com a Master Key.');
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
    :texto="modo === 'admin' ? 'Entre com a conta de administrador da sua organização.' : digitalDoMaster ? 'Acesso total com a digital deste aparelho ou com a Master Key.' : 'Acesso total com a Master Key.'"
  >
    <UiSegmented v-model="modo" :opcoes="MODOS" rotulo="Tipo de acesso" class="mb-5" @update:model-value="trocarModo" />

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
      <template v-if="digitalDoMaster">
        <UiButton tamanho="large" bloco :carregando="enviando" @click="entrarComDigital">
          <FingerPrintIcon class="h-5 w-5" />{{ enviando ? 'Verificando…' : 'Entrar com a digital' }}
        </UiButton>
        <p class="text-center text-footnote text-label-2">ou com a Master Key</p>
      </template>
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

      <UiButton type="submit" tamanho="large" bloco :variante="digitalDoMaster ? 'gray' : 'filled'" :carregando="enviando && !!chave" :disabled="!chave">
        {{ enviando && chave ? 'Verificando…' : 'Acessar painel' }}
      </UiButton>
    </form>

    <template #rodape>&copy; 2026 Astral Wave · LoginHub</template>
  </AuthShell>
</template>
