<script setup lang="ts">
import { computed } from 'vue';
import type { RouteLocationRaw } from 'vue-router';
import UiSpinner from './UiSpinner.vue';

/**
 * Botão nos estilos do iOS:
 *
 *   filled      ação principal da tela (uma por tela)
 *   tinted      ação secundária com cor (fundo da cor a 15%)
 *   gray        ação neutra (fundo de controle)
 *   plain       só texto, para ação terciária e barra de navegação
 *   destructive ação que apaga/bloqueia — vermelho, nunca a cor de destaque
 *
 * Alvo mínimo de 44pt em todos os tamanhos (HIG). Com `to` vira RouterLink,
 * com `href` vira <a>.
 */
const props = withDefaults(
  defineProps<{
    variante?: 'filled' | 'tinted' | 'gray' | 'plain' | 'destructive' | 'destructive-tinted';
    tamanho?: 'small' | 'regular' | 'large';
    bloco?: boolean;
    carregando?: boolean;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
    to?: RouteLocationRaw;
    href?: string;
    /** Só ícone: quadrado de 44pt, exige `aria-label`. */
    icone?: boolean;
  }>(),
  { variante: 'filled', tamanho: 'regular', type: 'button' },
);

const VARIANTES: Record<NonNullable<typeof props.variante>, string> = {
  filled: 'bg-accent text-white hover:bg-accent/90 active:bg-accent/80',
  tinted: 'bg-accent/15 text-accent hover:bg-accent/20 active:bg-accent/25',
  gray: 'bg-fill text-label hover:bg-fill-2 active:bg-fill-2',
  plain: 'bg-transparent text-accent hover:bg-accent/10 active:bg-accent/15',
  destructive: 'bg-danger text-white hover:bg-danger/90 active:bg-danger/80',
  'destructive-tinted': 'bg-danger/10 text-danger hover:bg-danger/15 active:bg-danger/20',
};

const TAMANHOS = {
  small: 'min-h-[36px] px-3 text-subhead rounded-full [@media(pointer:coarse)]:min-h-toque',
  regular: 'min-h-toque px-4 text-body rounded-controle',
  large: 'min-h-[50px] px-5 text-body rounded-[14px]',
};

const classes = computed(() => [
  'relative inline-flex select-none items-center justify-center gap-2 font-semibold transition-colors duration-150',
  'disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40',
  VARIANTES[props.variante],
  props.icone ? 'h-toque w-toque min-w-toque rounded-full p-0' : TAMANHOS[props.tamanho],
  props.bloco ? 'w-full' : '',
]);

const inativo = computed(() => props.disabled || props.carregando);
</script>

<template>
  <RouterLink v-if="to" :to="to" :class="classes" :aria-disabled="inativo || undefined">
    <slot />
  </RouterLink>
  <a v-else-if="href" :href="href" :class="classes" :aria-disabled="inativo || undefined">
    <slot />
  </a>
  <button v-else :type="type" :class="classes" :disabled="inativo" :aria-busy="carregando || undefined">
    <UiSpinner v-if="carregando" class="h-4 w-4" />
    <slot />
  </button>
</template>
