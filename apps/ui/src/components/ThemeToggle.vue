<script setup lang="ts">
import { MoonIcon, SunIcon } from '@heroicons/vue/24/outline';
import { useTema } from '@/composables/useTema';

const { escuro, alternar } = useTema();
</script>

<template>
  <!-- Canto inferior direito, fora da barra de gestos (safe area). -->
  <button
    type="button"
    class="material fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full text-label shadow-flutuante ring-1 ring-separator transition hover:scale-105"
    :aria-label="escuro ? 'Usar tema claro' : 'Usar tema escuro'"
    :title="escuro ? 'Tema claro' : 'Tema escuro'"
    @click="alternar"
  >
    <SunIcon v-if="escuro" class="h-6 w-6 text-warning" />
    <MoonIcon v-else class="h-6 w-6" />
  </button>
</template>
