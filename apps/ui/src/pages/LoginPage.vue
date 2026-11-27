<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
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
 *   Organização   → e-mail + senha + código enviado ao e-mail (ou só o código). É a conta de quem
 *                   foi convidado para cuidar de uma organização (LBS, Sul…).
 *   Cofre         → /meu-cofre; a Master Key e a digital do master moram lá (MasterEntrada, 27/11/2026).
 */
const router = useRouter();
const route = useRoute();
const modo = ref<'admin' | 'cofre'>('admin');
// Links antigos (?modo=master) caem na aba Cofre, onde a entrada do master mora agora.
if (route.query.modo === 'master') void router.replace({ path: '/meu-cofre', query: route.query.volta ? { volta: String(route.query.volta) } : {} });
/**
 * "Meu cofre" (21/11/2026, pedido do dono): qualquer pessoa com conta num app
 * de cofre liberado entra por aqui com a PRÓPRIA conta e a própria palavra-passe.
 * A tela é a /meu-cofre — a aba só leva até ela, sem misturar com o login do painel.
 */
const MODOS = [
  { valor: 'admin' as const, rotulo: 'Organização' },
  { valor: 'cofre' as const, rotulo: 'Cofre' },
];
function trocarModo(v: 'admin' | 'cofre') {
  erro.value = null;
  if (v === 'cofre') void router.push('/meu-cofre');
}

const email = ref('');
const senha = ref('');
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

// Código por e-mail (db/024): entrada sem senha e sem app de terceiros. Quem tem o
// Google Authenticator ativo (opcional) continua passando por ele depois do código.
const usarCodigo = ref(false);
const codigoChallenge = ref<string | null>(null);
const codigo = ref('');
const reenvioEm = ref(0);
let relogio: ReturnType<typeof setInterval> | null = null;

function iniciarRelogio(segundos: number) {
  reenvioEm.value = segundos;
  if (relogio) clearInterval(relogio);
  relogio = setInterval(() => {
    reenvioEm.value = Math.max(0, reenvioEm.value - 1);
    if (reenvioEm.value === 0 && relogio) { clearInterval(relogio); relogio = null; }
  }, 1000);
}
onBeforeUnmount(() => { if (relogio) clearInterval(relogio); });

function alternarCodigo() {
  usarCodigo.value = !usarCodigo.value;
  codigoChallenge.value = null;
  codigo.value = '';
  erro.value = null;
}

async function pedirCodigo() {
  erro.value = null;
  enviando.value = true;
  try {
    const r = await authApi.emailStart(email.value, { painel: true });
    codigoChallenge.value = r.challengeId;
    codigo.value = '';
    iniciarRelogio(r.reenvioEm);
  } catch (e: unknown) {
    erro.value = axios.isAxiosError(e) && e.response?.status === 429
      ? 'Muitos pedidos. Aguarde alguns minutos.'
      : mensagemDoErro(e, 'Não foi possível enviar o código.');
  } finally {
    enviando.value = false;
  }
}

async function confirmarCodigo() {
  if (!codigoChallenge.value) return;
  erro.value = null;
  enviando.value = true;
  try {
    const r = await authApi.emailVerify(codigoChallenge.value, codigo.value, { painel: true });
    if (r.requires2FA && r.challengeToken) {
      desafio.value = r.challengeToken;
      return;
    }
    await router.push(r.redirect);
  } catch (e: unknown) {
    erro.value = mensagemDoErro(e, 'Código inválido ou expirado. Peça um novo.');
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
    texto="Informe o código de verificação para entrar no painel."
  >
    <TwoFactorChallenge :challenge-token="desafio" pode-cancelar @autenticado="aposSegundoFator" @cancelar="cancelarDesafio" />
  </AuthShell>

  <AuthShell
    v-else
    titulo="LoginHub"
    texto="Entre com a conta de administrador da sua organização."
  >
    <UiSegmented v-model="modo" :opcoes="MODOS" rotulo="Tipo de acesso" class="mb-5" @update:model-value="trocarModo" />

    <form v-if="modo === 'admin' && usarCodigo" class="space-y-4" @submit.prevent="codigoChallenge ? confirmarCodigo() : pedirCodigo()">
      <UiTextField v-model="email" rotulo="E-mail" type="email" placeholder="voce@empresa.com" autocomplete="username" inputmode="email" :disabled="!!codigoChallenge" required>
        <template #icone><EnvelopeIcon /></template>
      </UiTextField>
      <template v-if="codigoChallenge">
        <UiTextField v-model="codigo" rotulo="Código recebido por e-mail" placeholder="000000" autocomplete="one-time-code" inputmode="numeric" maxlength="7" required>
          <template #icone><KeyIcon /></template>
        </UiTextField>
        <p class="text-center text-footnote text-label-2">
          Enviamos um código de 6 dígitos para o seu e-mail. Vale por 5 minutos.
          <button type="button" class="font-semibold text-accent disabled:opacity-50" :disabled="reenvioEm > 0 || enviando" @click="pedirCodigo">
            {{ reenvioEm > 0 ? `Reenviar em ${reenvioEm}s` : 'Reenviar código' }}
          </button>
        </p>
      </template>

      <div v-if="erro" role="alert" class="rounded-celula bg-danger/10 p-3">
        <p class="text-subhead font-semibold text-danger">Falha na autenticação</p>
        <p class="mt-0.5 text-subhead text-danger">{{ erro }}</p>
      </div>

      <UiButton type="submit" tamanho="large" bloco :carregando="enviando" :disabled="!email || (!!codigoChallenge && codigo.replace(/\s/g, '').length !== 6)">
        {{ enviando ? 'Verificando…' : codigoChallenge ? 'Entrar' : 'Enviar código' }}
      </UiButton>
      <button type="button" class="block w-full text-center text-footnote font-semibold text-accent" @click="alternarCodigo">Entrar com senha</button>
    </form>

    <form v-else-if="modo === 'admin'" class="space-y-4" @submit.prevent="entrarAdmin">
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
      <button type="button" class="block w-full text-center text-footnote font-semibold text-accent" @click="alternarCodigo">Entrar com código por e-mail</button>
      <p class="text-center text-footnote text-label-2">
        Recebeu um convite? Abra o link do e-mail para criar a senha. Em cada acesso enviamos um código para o seu e-mail.
      </p>
    </form>


    <template #rodape>&copy; 2026 Astral Wave · LoginHub</template>
  </AuthShell>
</template>
