<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { FingerPrintIcon, KeyIcon } from '@heroicons/vue/24/outline';
import { authApi, masterDigitalApi } from '@loginhub/api-client';
import UiButton from '@/components/ui/UiButton.vue';
import UiTextField from '@/components/ui/UiTextField.vue';
import { digitalMasterSuportada, entrarComADigitalDoMaster, ErroDigitalMaster } from '@/features/masterDigital';

/**
 * Entrada do master (27/11/2026, pedido do dono): a aba "Master Key" saiu do login e a entrada do master mora
 * junto da aba Cofre. Vale o que já valia: a digital do aparelho (db/020), quando cadastrada, ou a Master Key.
 * `volta` é o caminho interno de retorno da entrada pelo cofre (/cofre/entrada?…); sem ele vai para o painel.
 */
const props = defineProps<{ volta?: string | null }>();
const router = useRouter();

const chave = ref('');
const erro = ref<string | null>(null);
const enviando = ref(false);
const digitalDoMaster = ref(false);

onMounted(async () => {
  if (!digitalMasterSuportada()) return;
  try {
    digitalDoMaster.value = await masterDigitalApi.disponivel();
  } catch {
    /* sem resposta: fica só a Master Key */
  }
});

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

const destino = () => props.volta ?? '/dashboard';

async function entrarMaster() {
  erro.value = null;
  enviando.value = true;
  try {
    // A chave digitada vai inteira para o servidor, que é quem a compara com a MASTER_API_KEY.
    await authApi.loginMaster(chave.value);
    await router.push(destino());
  } catch (e: unknown) {
    erro.value = mensagemDoErro(e, 'Master Key inválida ou acesso negado.');
  } finally {
    enviando.value = false;
  }
}

async function entrarComDigital() {
  erro.value = null;
  enviando.value = true;
  try {
    await entrarComADigitalDoMaster();
    await router.push(destino());
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
</script>

<template>
  <form class="space-y-4" @submit.prevent="entrarMaster">
    <template v-if="digitalDoMaster">
      <UiButton tamanho="large" bloco :carregando="enviando && !chave" @click="entrarComDigital">
        <FingerPrintIcon class="h-5 w-5" />{{ enviando && !chave ? 'Verificando…' : 'Entrar com a digital' }}
      </UiButton>
      <p class="text-center text-footnote text-label-2">ou com a Master Key</p>
    </template>
    <UiTextField v-model="chave" rotulo="Master Key" rotulo-oculto type="password" revelar placeholder="Master Key" autocomplete="current-password" required>
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
</template>
