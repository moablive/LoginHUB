<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { authApi, ehSuperAdmin, twoFactorApi } from '@loginhub/api-client';
import AuthShell from '@/components/AuthShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import SegurancaConta from '@/components/seguranca/SegurancaConta.vue';

/**
 * /seguranca (27/11/2026): a pessoa que entrou no painel pelo e-mail ativa, por conta própria, a verificação
 * em duas etapas por aplicativo autenticador. O cartão é o mesmo que os apps da suíte usam (kit do hub);
 * aqui ele conversa com a API do hub pelo cliente do painel.
 *
 * A Master Key não tem conta de e-mail no hub (nada a configurar): a tela só explica isso.
 */
const router = useRouter();
const master = ehSuperAdmin();

onMounted(() => {
  if (!authApi.isAuthenticated()) void router.replace('/login');
});

// O cartão fala com um cliente mínimo; o do painel (axios) já tem todas as rotas.
const hub = {
  twoFactor: {
    status: twoFactorApi.status,
    pedirCodigoEmail: twoFactorApi.pedirCodigoEmail,
    setup: (_token?: string, prova?: { challengeId: string; codigoEmail: string }) => twoFactorApi.setup(prova),
    verifySetup: twoFactorApi.verifySetup,
    disable: twoFactorApi.disable,
    regenerateBackupCodes: twoFactorApi.regenerateBackupCodes,
  },
};
</script>

<template>
  <AuthShell titulo="Segurança da conta" texto="Reforce o seu acesso com um aplicativo autenticador, quando quiser.">
    <p v-if="master" class="text-subhead text-label-2">A Master Key não tem verificação em duas etapas por aplicativo: o acesso dela é pela chave ou pela digital cadastrada no painel.</p>
    <SegurancaConta v-else :hub="hub" />
    <UiButton class="mt-4" variante="gray" bloco to="/dashboard">Voltar ao painel</UiButton>
  </AuthShell>
</template>
