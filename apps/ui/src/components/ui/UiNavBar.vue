<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { ChevronLeftIcon } from '@heroicons/vue/24/outline';
import type { RouteLocationRaw } from 'vue-router';

/**
 * Barra de navegação do iOS com título grande.
 *
 * Em cima, a barra fina de vidro (voltar à esquerda, ações à direita) fica
 * presa no topo. Embaixo dela, o título grande (Large Title, 34px). Quando o
 * título grande sai da tela, o título pequeno aparece no centro da barra — é
 * assim que o Ajustes e o Mail fazem, e a pessoa nunca perde onde está.
 *
 * Controle separado do conteúdo (HIG › Layout): a barra é material, a página
 * não.
 */
defineProps<{
  titulo: string;
  subtitulo?: string;
  voltar?: RouteLocationRaw;
  voltarTexto?: string;
}>();

const sentinela = ref<HTMLElement | null>(null);
const compacto = ref(false);
let observador: IntersectionObserver | null = null;

onMounted(() => {
  if (!sentinela.value || typeof IntersectionObserver === 'undefined') return;
  observador = new IntersectionObserver(([e]) => (compacto.value = !e?.isIntersecting), {
    rootMargin: '-52px 0px 0px 0px',
  });
  observador.observe(sentinela.value);
});
onBeforeUnmount(() => observador?.disconnect());
</script>

<template>
  <div class="-mx-4 sm:-mx-6 lg:-mx-8">
    <div
      class="sticky top-0 z-30 pt-[env(safe-area-inset-top)] transition-colors duration-200"
      :class="compacto ? 'material linha-fina' : 'bg-canvas'"
    >
      <div class="mx-auto grid h-[52px] max-w-[1200px] grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 sm:px-4 lg:px-6">
        <div class="flex min-w-0 items-center">
          <RouterLink
            v-if="voltar"
            :to="voltar"
            class="toque -ml-1 flex min-h-toque items-center gap-0.5 rounded-lg pr-2 text-body text-accent hover:opacity-70"
          >
            <ChevronLeftIcon class="h-6 w-6" stroke-width="2.5" />
            <span class="truncate">{{ voltarTexto || 'Voltar' }}</span>
          </RouterLink>
        </div>

        <p
          class="max-w-[50vw] truncate text-headline font-semibold transition-opacity duration-200"
          :class="compacto ? 'opacity-100' : 'opacity-0'"
          :aria-hidden="!compacto"
        >
          {{ titulo }}
        </p>

        <div class="flex items-center justify-end gap-1">
          <slot name="acoes" />
        </div>
      </div>
    </div>

    <div class="mx-auto max-w-[1200px] px-4 pb-2 pt-1 sm:px-6 lg:px-8">
      <h1 ref="sentinela" class="text-large-title font-bold">{{ titulo }}</h1>
      <p v-if="subtitulo || $slots.subtitulo" class="mt-1 text-subhead text-label-2">
        <slot name="subtitulo">{{ subtitulo }}</slot>
      </p>
    </div>
  </div>
</template>
