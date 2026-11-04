<script setup lang="ts">
import { ref } from 'vue';
import { twoFactorApi } from '@loginhub/api-client';
import UiButton from '@/components/ui/UiButton.vue';
import DigiteDoGoogleAuth from './DigiteDoGoogleAuth.vue';
import CodigoInput from './CodigoInput.vue';

/**
 * Segunda etapa do login. Componente de referência para apps clientes.
 *
 * O `challengeToken` vale 5 minutos e serve só para esta troca — não é sessão
 * e não abre rota nenhuma. Se expirar, o caminho é refazer o login.
 */
const props = defineProps<{
  /** Vem de `authApi.login(...)` quando ele devolve `requires2FA`. */
  challengeToken: string;
  podeCancelar?: boolean;
}>();
const emit = defineEmits<{ autenticado: []; cancelar: [] }>();

const codigo = ref('');
const usarBackup = ref(false);
const erro = ref<string | null>(null);
const enviando = ref(false);

interface ErroApi {
  response?: { data?: { error?: string; message?: string } };
}

async function enviar() {
  enviando.value = true;
  erro.value = null;
  try {
    if (usarBackup.value) await twoFactorApi.verifyBackup(props.challengeToken, codigo.value);
    else await twoFactorApi.verify(props.challengeToken, codigo.value);
    emit('autenticado');
  } catch (e) {
    const dados = (e as ErroApi)?.response?.data;
    erro.value =
      dados?.error === 'CHALLENGE_INVALIDO'
        ? 'A janela de verificação expirou. Faça login novamente.'
        : dados?.error === 'MUITAS_TENTATIVAS'
          ? dados.message || 'Muitas tentativas. Aguarde alguns minutos.'
          : 'Código inválido.';
  } finally {
    enviando.value = false;
  }
}

function alternarModo() {
  usarBackup.value = !usarBackup.value;
  codigo.value = '';
  erro.value = null;
}
</script>

<template>
  <form class="w-full space-y-4" @submit.prevent="enviar">
    <p class="text-center text-subhead text-label-2">
      {{
        usarBackup
          ? 'Digite um dos códigos de recuperação que você guardou.'
          : 'Digite o código de 6 dígitos do seu aplicativo autenticador.'
      }}
    </p>

    <DigiteDoGoogleAuth v-if="!usarBackup" />

    <CodigoInput v-model="codigo" :backup="usarBackup" :rotulo="usarBackup ? 'Código de recuperação' : 'Código de 6 dígitos'" />

    <p v-if="erro" role="alert" class="rounded-celula bg-danger/10 p-3 text-subhead text-danger">{{ erro }}</p>

    <UiButton type="submit" tamanho="large" bloco :carregando="enviando" :disabled="usarBackup ? codigo.length < 11 : codigo.length !== 6">
      {{ enviando ? 'Verificando…' : 'Verificar' }}
    </UiButton>

    <div class="flex items-center justify-between gap-2">
      <UiButton variante="plain" tamanho="small" @click="alternarModo">
        {{ usarBackup ? 'Usar o aplicativo autenticador' : 'Perdi o acesso ao autenticador' }}
      </UiButton>
      <UiButton v-if="podeCancelar" variante="plain" tamanho="small" class="!text-label-2" @click="emit('cancelar')">Cancelar</UiButton>
    </div>
  </form>
</template>
