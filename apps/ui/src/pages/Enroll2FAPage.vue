<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline';
import AuthShell from '@/components/AuthShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import TwoFactorSetup from '@/features/twoFactor/TwoFactorSetup.vue';

/**
 * Tela de enrolamento de 2FA compartilhada por TODOS os apps do hub.
 *
 * Um app cliente que recebe `require2FASetup` no login tem em mãos um passe de
 * 10 minutos e nenhuma tela para gastá-lo. Em vez de cada um dos oito
 * reimplementar QR, digitação manual e códigos de recuperação — e divergir —,
 * todos mandam a pessoa para cá:
 *
 *     https://loginhub.astralwavelabel.com/enrolar-2fa?token=<setupToken>
 *
 * O passe entra pela query string porque é exatamente o que o app cliente tem;
 * ele não abre rota nenhuma além das de enrolamento, e vale 10 minutos.
 *
 * `retorno` (opcional) leva a pessoa de volta ao app depois de concluir.
 */
const route = useRoute();
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : null));
const retorno = computed(() => {
  const r = typeof route.query.retorno === 'string' ? route.query.retorno : null;
  // Só http(s): `javascript:` no `retorno` viraria XSS no botão de voltar.
  return r && /^https?:\/\//i.test(r) ? r : null;
});
const pronto = ref(false);

watchEffect(() => {
  if (!token.value) return;
  // O `twoFactorApi` lê a credencial do storage, como em qualquer outra tela.
  // Gravar o passe aqui é o que permite reusar o componente de enrolamento
  // sem duplicá-lo com uma versão "que recebe token por prop".
  localStorage.setItem('awl_token', token.value);
  pronto.value = true;
});
</script>

<template>
  <AuthShell
    v-if="!token"
    titulo="Link inválido"
    tom="danger"
    :icone="ExclamationTriangleIcon"
    texto="Este endereço precisa do passe de enrolamento que o seu aplicativo emite ao fazer login. Volte ao app e entre de novo para gerar um novo — ele vale 10 minutos."
  />

  <AuthShell
    v-else-if="pronto"
    titulo="Configure a verificação em duas etapas"
    texto="Esta conta exige um segundo fator. Tenha o celular à mão com o Google Authenticator instalado."
  >
    <TwoFactorSetup auto-iniciar />

    <div v-if="retorno" class="mt-8 border-t pt-6 text-center">
      <UiButton tamanho="large" bloco :href="retorno">Voltar para o aplicativo</UiButton>
      <!-- A sessão nasce no app, não aqui: atravessar origens com o token seria
           pior. Dizer isso evita a impressão de que o enrolamento não terminou. -->
      <p class="mt-3 text-footnote text-label-2">
        Lá você entra com a senha nova e o código do autenticador. Se o código acabou de ser usado, espere o próximo (30s).
      </p>
    </div>
  </AuthShell>
</template>
