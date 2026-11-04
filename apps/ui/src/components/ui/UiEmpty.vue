<script setup lang="ts">
import type { Component } from 'vue';
/** Estado vazio: ícone grande e apagado, título e uma frase do que fazer. */
defineProps<{ icone?: Component; titulo: string; texto?: string }>();
</script>

<template>
  <div class="flex flex-col items-center px-6 py-12 text-center">
    <component :is="icone" v-if="icone" class="mb-3 h-12 w-12 text-label-3" aria-hidden="true" />
    <p class="text-title-3 font-semibold text-label">{{ titulo }}</p>
    <p v-if="texto" class="mt-1 max-w-sm text-subhead text-label-2">{{ texto }}</p>
    <div v-if="$slots.default" class="mt-5"><slot /></div>
  </div>
</template>
