<script setup lang="ts">
/** Interruptor do iOS (51×31). Verde ligado, como no sistema. */
defineProps<{ rotulo: string; disabled?: boolean }>();
const ligado = defineModel<boolean>({ default: false });
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="ligado"
    :aria-label="rotulo"
    :disabled="disabled"
    class="relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-40"
    :class="ligado ? 'bg-success' : 'bg-fill'"
    @click="ligado = !ligado"
  >
    <span
      class="inline-block h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/0.15),0_1px_1px_rgb(0_0_0/0.16)] transition-transform duration-200"
      :class="ligado ? 'translate-x-[22px]' : 'translate-x-[2px]'"
    />
  </button>
</template>
