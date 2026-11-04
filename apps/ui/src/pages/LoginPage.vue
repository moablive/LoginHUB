<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { KeyIcon } from '@heroicons/vue/24/outline';
import { authApi } from '@loginhub/api-client';
import AuthShell from '@/components/AuthShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiTextField from '@/components/ui/UiTextField.vue';

const router = useRouter();
const chave = ref('');
const erro = ref<string | null>(null);
const enviando = ref(false);

async function entrar() {
  erro.value = null;
  enviando.value = true;
  try {
    // A chave digitada vai inteira para o servidor, que é quem a compara com
    // a MASTER_API_KEY. O painel não conhece a chave — antes ele a tinha no
    // bundle (`VITE_MASTER_KEY`) e comparava no navegador.
    await authApi.loginMaster(chave.value);
    // Sucesso: o authApi já gravou token e flag de super admin.
    await router.push('/dashboard');
  } catch (e: unknown) {
    console.error('Erro no login:', e);
    if (axios.isAxiosError(e)) {
      const status = e.response?.status;
      if (status === 401 || status === 403) erro.value = 'Master Key inválida ou acesso negado.';
      else if (e.code === 'ERR_NETWORK') erro.value = 'Sem conexão com o servidor (API fora do ar).';
      else erro.value = `Erro do servidor: ${e.message}`;
    } else if (e instanceof Error) {
      erro.value = e.message;
    } else {
      erro.value = 'Ocorreu um erro inesperado. Tente novamente.';
    }
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <AuthShell titulo="LoginHub" texto="Acesso administrativo com a Master Key.">
    <form class="space-y-4" @submit.prevent="entrar">
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
