<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/vue/24/outline';
import { authApi } from '@loginhub/api-client';
import AuthShell from '@/components/AuthShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiTextField from '@/components/ui/UiTextField.vue';
import TwoFactorSetup from '@/features/twoFactor/TwoFactorSetup.vue';
import TwoFactorChallenge from '@/features/twoFactor/TwoFactorChallenge.vue';

const route = useRoute();
const router = useRouter();
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : null));

const senha = ref('');
const confirmacao = ref('');
const erro = ref<string | null>(null);
const carregando = ref(false);
const sucesso = ref(false);
// 2FA é exigido de toda conta, então a página emenda no enrolamento em vez de
// mandar para o login. O QR é desenhado AQUI, no navegador — nunca no e-mail,
// senão os dois fatores viajariam pelo mesmo canal.
const precisaEnrolar = ref(false);
// Reset de senha numa conta que JÁ tem 2FA: definir a senha não substitui o
// segundo fator, então o backend devolve desafio em vez de sessão e a página
// fecha o login aqui mesmo.
const desafio = ref<string | null>(null);

let timer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(timer));

function concluir() {
  desafio.value = null;
  sucesso.value = true;
  timer = setTimeout(() => void router.push('/login'), 3000);
}

async function salvar() {
  if (!token.value) {
    erro.value = 'Token inválido ou ausente.';
    return;
  }
  if (senha.value.length < 6) {
    erro.value = 'A senha deve ter pelo menos 6 caracteres.';
    return;
  }
  if (senha.value !== confirmacao.value) {
    erro.value = 'As senhas não coincidem.';
    return;
  }

  carregando.value = true;
  erro.value = null;
  try {
    const r = await authApi.setupPassword(token.value, senha.value);
    if (r.requires2FA && r.challengeToken) {
      desafio.value = r.challengeToken;
      return;
    }
    if (r.require2FASetup) {
      precisaEnrolar.value = true;
      return;
    }
    concluir();
  } catch (e: unknown) {
    erro.value = (e instanceof Error && e.message) || 'Erro ao definir a senha. O link pode ter expirado.';
  } finally {
    carregando.value = false;
  }
}
</script>

<template>
  <AuthShell
    v-if="!token"
    titulo="Link inválido"
    tom="danger"
    :icone="ExclamationTriangleIcon"
    texto="Não foi possível encontrar o token de acesso. O link pode estar quebrado ou já foi utilizado."
  >
    <UiButton tamanho="large" bloco to="/login">Ir para o login</UiButton>
  </AuthShell>

  <AuthShell
    v-else-if="desafio"
    titulo="Senha definida. Confirme quem é você."
    texto="Esta conta já tem verificação em duas etapas. Informe o código do Google Authenticator."
  >
    <TwoFactorChallenge :challenge-token="desafio" @autenticado="concluir" />
  </AuthShell>

  <AuthShell
    v-else-if="precisaEnrolar"
    titulo="Senha definida. Falta um passo."
    texto="Este convite exige verificação em duas etapas. Tenha o celular à mão com o Google Authenticator instalado."
  >
    <TwoFactorSetup auto-iniciar />
  </AuthShell>

  <AuthShell
    v-else-if="sucesso"
    titulo="Senha definida!"
    tom="success"
    :icone="CheckCircleIcon"
    texto="Sua senha foi configurada com sucesso. Você já pode acessar a plataforma."
  >
    <p class="text-center text-footnote text-label-2">Redirecionando para o login…</p>
  </AuthShell>

  <AuthShell v-else titulo="Defina sua senha" texto="Crie uma senha segura para o seu primeiro acesso.">
    <form class="space-y-4" @submit.prevent="salvar">
      <p v-if="erro" role="alert" class="rounded-celula bg-danger/10 p-3 text-center text-subhead text-danger">{{ erro }}</p>

      <UiTextField v-model="senha" rotulo="Nova senha" type="password" revelar autocomplete="new-password" placeholder="Mínimo de 6 caracteres" required />
      <UiTextField v-model="confirmacao" rotulo="Confirme a senha" type="password" revelar autocomplete="new-password" placeholder="Repita a senha" required />

      <UiButton type="submit" tamanho="large" bloco class="!mt-6" :carregando="carregando">
        {{ carregando ? 'Salvando…' : 'Salvar senha e acessar' }}
      </UiButton>
    </form>
  </AuthShell>
</template>
