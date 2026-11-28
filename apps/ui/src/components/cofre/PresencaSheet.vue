<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import axios from 'axios';
import { FingerPrintIcon, ShieldCheckIcon } from '@heroicons/vue/24/outline';
import UiSheet from '@/components/ui/UiSheet.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiTextField from '@/components/ui/UiTextField.vue';
import { useCofre } from '@/features/cofre/useCofre';
import { digitalSuportada, ErroDigital } from '@/features/cofre/digital';
import { pedidoDePresenca, presencaCancelada, presencaConfirmada, PRESENCA_MS } from '@/features/cofre/revelar';

/**
 * "Confirme que é você" (28/11/2026): aparece quando a pessoa pede para mostrar ou copiar um dado sensível (número do
 * cartão, CVV, documento, arquivo) e a última confirmação já passou de 60 s. Digital primeiro; a palavra-passe é a
 * alternativa (e o único caminho em aparelho sem digital cadastrada). Nada sai do navegador.
 */
const cofre = useCofre();
const { temDigital } = cofre;

const aberta = computed(() => pedidoDePresenca.value !== null);
const ocupado = ref(false);
const erro = ref<string | null>(null);
const palavra = ref('');
const usarSenha = ref(false);
const podeDigital = computed(() => temDigital.value && digitalSuportada());

watch(aberta, (v) => {
  if (v) {
    erro.value = null;
    palavra.value = '';
    usarSenha.value = !podeDigital.value;
  }
});

async function porDigital() {
  ocupado.value = true;
  erro.value = null;
  try {
    await cofre.provarPresencaComDigital();
    presencaConfirmada();
  } catch (e) {
    if (e instanceof ErroDigital && e.codigo === 'CANCELADO') erro.value = null;
    else erro.value = 'Não deu para confirmar pela digital. Tente de novo ou use a palavra-passe.';
  } finally {
    ocupado.value = false;
  }
}

async function porSenha() {
  if (!palavra.value) return;
  ocupado.value = true;
  erro.value = null;
  try {
    await cofre.conferirSenha(palavra.value);
    palavra.value = '';
    presencaConfirmada();
  } catch (e) {
    erro.value = e instanceof Error && e.message === 'CHAVE_ERRADA' ? 'Palavra-passe errada.' : axios.isAxiosError(e) ? 'Sem conexão para conferir.' : 'Não deu para conferir a palavra-passe.';
  } finally {
    ocupado.value = false;
  }
}

function fechar() {
  palavra.value = '';
  presencaCancelada();
}
</script>

<template>
  <UiSheet :aberto="aberta" titulo="Confirme que é você" :subtitulo="`Vale por ${PRESENCA_MS / 1000} segundos`" largura="sm" :bloqueado="ocupado" @fechar="fechar">
    <div class="space-y-4">
      <div class="flex justify-center py-1" aria-hidden="true">
        <span class="flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 text-accent"><FingerPrintIcon class="h-8 w-8" /></span>
      </div>
      <p class="text-center text-subhead text-label-2">O cofre está aberto, mas número de cartão, CVV, documentos e arquivos pedem sua digital ou palavra-passe de novo.</p>
      <p v-if="erro" class="rounded-controle bg-danger/10 px-3 py-2 text-footnote text-danger" role="alert">{{ erro }}</p>
      <form v-if="usarSenha" class="space-y-3" @submit.prevent="porSenha">
        <UiTextField v-model="palavra" rotulo="Palavra-passe do cofre" type="password" autocomplete="current-password" revelar />
        <UiButton type="submit" bloco :carregando="ocupado" :disabled="!palavra"><ShieldCheckIcon class="h-5 w-5" />Confirmar</UiButton>
        <UiButton v-if="podeDigital" variante="plain" bloco @click="usarSenha = false">Usar a digital</UiButton>
      </form>
      <div v-else class="space-y-2">
        <UiButton bloco :carregando="ocupado" @click="porDigital"><FingerPrintIcon class="h-5 w-5" />Confirmar com a digital</UiButton>
        <UiButton variante="plain" bloco @click="usarSenha = true">Usar a palavra-passe</UiButton>
      </div>
    </div>
    <template #acoes>
      <UiButton variante="gray" @click="fechar">Cancelar</UiButton>
    </template>
  </UiSheet>
</template>
