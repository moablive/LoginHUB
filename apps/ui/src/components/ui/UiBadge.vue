<script setup lang="ts">
/**
 * Selo pequeno (caption). A cor NUNCA é o único sinal (HIG › Cor): o texto
 * sempre diz o que o selo significa.
 */
withDefaults(defineProps<{ tom?: 'neutro' | 'accent' | 'success' | 'warning' | 'danger' | 'indigo' }>(), { tom: 'neutro' });
const TONS = {
  neutro: 'bg-fill-2 text-label-2',
  accent: 'bg-accent/15 text-accent',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  indigo: 'bg-indigo/15 text-indigo',
};
</script>

<template>
  <span class="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-caption-1 font-semibold" :class="TONS[tom]">
    <slot />
  </span>
</template>
