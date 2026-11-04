<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowPathIcon } from '@heroicons/vue/24/outline';
import UiButton from '@/components/ui/UiButton.vue';
import { useVersionCheck } from './useVersionCheck';

/**
 * Aviso de "nova versão disponível".
 *
 * O hub não tem precache: o service worker roda com `injectionPoint: undefined`
 * (ver vite.config.ts), justamente porque o painel já ficou preso numa versão
 * antiga por causa dele. Sem precache, o `window.location.reload()` do
 * useVersionCheck busca o index.html do servidor de verdade — não há o que
 * conciliar com o SW.
 */
const { versaoNova, atualizar } = useVersionCheck();

// Dispensar vale só para a versão dispensada: se sair outro deploy depois, o
// aviso volta. Dispensar de vez esconderia o próximo.
const dispensada = ref<string | null>(null);

const versaoAtual = import.meta.env.VITE_APP_VERSION || '';
const visivel = computed(() => Boolean(versaoNova.value) && dispensada.value !== versaoNova.value);

// Rebuild sem bump muda só a data: citar o número confundiria ("a v1.0.4 já
// está no ar" para quem está na v1.0.4).
const descricao = computed(() =>
  versaoNova.value && versaoNova.value !== versaoAtual
    ? `A v${versaoNova.value} já está no ar. Atualize para carregar a versão mais recente.`
    : 'Um build mais recente está no ar. Atualize para carregá-lo.',
);
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-3 opacity-0"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="translate-y-3 opacity-0"
  >
    <!-- Acima do botão de tema (bottom-20) e por cima de tudo, menos as modais. -->
    <div
      v-if="visivel"
      role="status"
      aria-live="polite"
      class="material fixed inset-x-3 bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.5rem))] z-[55] rounded-[14px] p-4 text-label shadow-folha ring-1 ring-separator sm:left-auto sm:right-5 sm:w-[340px]"
    >
      <div class="flex items-start gap-3">
        <span class="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden="true" />
        <div class="min-w-0">
          <p class="text-headline font-semibold">Nova versão disponível</p>
          <p class="mt-0.5 text-footnote text-label-2">{{ descricao }}</p>
        </div>
      </div>
      <div class="mt-3 flex justify-end gap-2">
        <UiButton variante="plain" tamanho="small" @click="dispensada = versaoNova">Depois</UiButton>
        <UiButton tamanho="small" @click="atualizar">
          <ArrowPathIcon class="h-4 w-4" />
          Atualizar agora
        </UiButton>
      </div>
    </div>
  </Transition>
</template>
