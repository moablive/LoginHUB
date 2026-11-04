<script setup lang="ts">
import { MagnifyingGlassIcon, XCircleIcon } from '@heroicons/vue/20/solid';

/** Campo de busca do iOS: lupa, fundo de controle e o X para limpar. */
defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ placeholder?: string; rotulo?: string }>(), { placeholder: 'Buscar', rotulo: 'Buscar' });
const modelo = defineModel<string>({ default: '' });
</script>

<template>
  <div class="relative w-full">
    <MagnifyingGlassIcon class="pointer-events-none absolute left-2.5 top-1/2 h-5 w-5 -translate-y-1/2 text-label-2" aria-hidden="true" />
    <input
      v-model="modelo"
      v-bind="$attrs"
      type="search"
      :placeholder="placeholder"
      :aria-label="rotulo"
      enterkeyhint="search"
      class="block h-10 w-full rounded-[10px] border-0 bg-fill-2 pl-9 pr-9 text-body text-label outline-none placeholder:text-label-2 focus:ring-2 focus:ring-accent [&::-webkit-search-cancel-button]:hidden"
    />
    <button
      v-if="modelo"
      type="button"
      class="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-label-3 hover:text-label-2"
      aria-label="Limpar busca"
      @click="modelo = ''"
    >
      <XCircleIcon class="h-5 w-5" />
    </button>
  </div>
</template>
