<script setup lang="ts">
import { ref } from 'vue';
import { NoSymbolIcon, ShieldCheckIcon } from '@heroicons/vue/24/outline';
import UiAlert from './ui/UiAlert.vue';

/**
 * Selo de status que também é botão: mostra ATIVO/INATIVO e, no toque, pede
 * confirmação para bloquear ou reativar. O texto muda junto com a cor — cor
 * nunca é o único sinal.
 */
const props = defineProps<{
  status: 'ativo' | 'inativo';
  /** Nome do app ou do usuário, para o alerta dizer quem será afetado. */
  nome: string;
}>();
const emit = defineEmits<{ alternar: [] }>();

const aberto = ref(false);
const ativo = () => props.status === 'ativo';

function confirmar() {
  aberto.value = false;
  emit('alternar');
}
</script>

<template>
  <button
    type="button"
    class="group inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-3 text-caption-1 font-semibold transition-colors [@media(pointer:coarse)]:min-h-toque"
    :class="
      ativo()
        ? 'bg-success/15 text-success hover:bg-danger/15 hover:text-danger'
        : 'bg-danger/15 text-danger hover:bg-success/15 hover:text-success'
    "
    :aria-label="ativo() ? `Ativo. Toque para bloquear ${nome}` : `Inativo. Toque para reativar ${nome}`"
    @click="aberto = true"
  >
    <span class="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
    <span class="group-hover:hidden">{{ ativo() ? 'Ativo' : 'Inativo' }}</span>
    <span class="hidden group-hover:inline">{{ ativo() ? 'Bloquear' : 'Ativar' }}</span>
  </button>

  <UiAlert
    :aberto="aberto"
    :tom="ativo() ? 'danger' : 'success'"
    :icone="ativo() ? NoSymbolIcon : ShieldCheckIcon"
    :titulo="ativo() ? 'Bloquear acesso?' : 'Reativar acesso?'"
    :destaque="nome"
    :confirmar="ativo() ? 'Bloquear' : 'Reativar'"
    @fechar="aberto = false"
    @confirmar="confirmar"
  >
    {{
      ativo()
        ? 'Perde o acesso à plataforma na hora, até ser reativado.'
        : 'Poderá fazer login de novo imediatamente.'
    }}
  </UiAlert>
</template>
