<script setup lang="ts" generic="T extends string | number">
/** Controle segmentado do iOS: 2 a 5 opções mutuamente exclusivas. */
defineProps<{ opcoes: { valor: T; rotulo: string }[]; rotulo: string }>();
const modelo = defineModel<T>({ required: true });
</script>

<template>
  <div role="radiogroup" :aria-label="rotulo" class="flex w-full rounded-[9px] bg-fill-2 p-0.5">
    <button
      v-for="o in opcoes"
      :key="String(o.valor)"
      type="button"
      role="radio"
      :aria-checked="modelo === o.valor"
      class="min-h-[32px] flex-1 rounded-[7px] px-3 text-subhead font-medium transition [@media(pointer:coarse)]:min-h-toque"
      :class="modelo === o.valor ? 'bg-surface text-label shadow-[0_3px_8px_rgb(0_0_0/0.12)] dark:bg-[#636366]' : 'text-label hover:text-label-2'"
      @click="modelo = o.valor"
    >
      {{ o.rotulo }}
    </button>
  </div>
</template>
