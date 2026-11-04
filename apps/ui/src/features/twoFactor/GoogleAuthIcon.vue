<script setup lang="ts">
/** Ícone desenhado aqui (as cores do Google), sem imagem remota. */
withDefaults(defineProps<{ tamanho?: number }>(), { tamanho: 40 });
</script>

<template>
  <svg :width="tamanho" :height="tamanho" viewBox="0 0 48 48" aria-hidden="true" class="shrink-0">
    <rect width="48" height="48" rx="11" fill="#fff" />
    <path d="M24 8a16 16 0 0 1 13.86 8L31 20a8 8 0 0 0-7-4z" fill="#EA4335" />
    <path d="M37.86 16a16 16 0 0 1 0 16L31 28a8 8 0 0 0 0-8z" fill="#FBBC05" />
    <path d="M37.86 32A16 16 0 0 1 24 40v-8a8 8 0 0 0 7-4z" fill="#34A853" />
    <path d="M24 40a16 16 0 0 1 0-32v8a8 8 0 0 0 0 16z" fill="#4285F4" />
    <rect x="24" y="21.5" width="16" height="5" rx="2.5" fill="#4285F4" />
    <circle cx="24" cy="24" r="4" fill="#fff" />
  </svg>
</template>
