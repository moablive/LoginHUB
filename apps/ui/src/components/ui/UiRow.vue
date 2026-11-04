<script setup lang="ts">
import { ChevronRightIcon } from '@heroicons/vue/20/solid';
import type { RouteLocationRaw } from 'vue-router';

/**
 * Linha de lista do iOS: ícone opcional à esquerda, título e subtítulo, valor
 * ou controle à direita e, se navega, o chevron. Altura mínima de 44pt.
 *
 * Com `to` vira link; com `clicavel` vira botão (emite `click`).
 */
defineProps<{
  titulo?: string;
  subtitulo?: string;
  valor?: string;
  to?: RouteLocationRaw;
  clicavel?: boolean;
  chevron?: boolean;
}>();
defineEmits<{ click: [e: MouseEvent] }>();
</script>

<template>
  <component
    :is="to ? 'RouterLink' : clicavel ? 'button' : 'div'"
    :to="to"
    :type="clicavel && !to ? 'button' : undefined"
    class="flex min-h-toque w-full items-center gap-3 px-4 py-2.5 text-left"
    :class="to || clicavel ? 'transition-colors hover:bg-fill-2 active:bg-fill' : ''"
    @click="(e: MouseEvent) => $emit('click', e)"
  >
    <span v-if="$slots.icone" class="flex shrink-0 items-center [&>svg]:h-6 [&>svg]:w-6"><slot name="icone" /></span>
    <span class="min-w-0 flex-1">
      <slot>
        <span class="block truncate text-body text-label">{{ titulo }}</span>
        <span v-if="subtitulo" class="block truncate text-subhead text-label-2">{{ subtitulo }}</span>
      </slot>
    </span>
    <span v-if="valor" class="shrink-0 text-body text-label-2">{{ valor }}</span>
    <slot name="direita" />
    <ChevronRightIcon v-if="chevron || to" class="h-5 w-5 shrink-0 text-label-3" aria-hidden="true" />
  </component>
</template>
