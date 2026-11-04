<script setup lang="ts">
/**
 * `v1.0.0` discreto no canto — responde metade das dúvidas de suporte antes de
 * virarem chamado ("qual versão você está vendo?").
 *
 * Canto inferior ESQUERDO de propósito: o direito é do botão de tema.
 */
const versao = import.meta.env.VITE_APP_VERSION || '0.0.0';
const buildDate = import.meta.env.VITE_APP_BUILD_DATE || '';

const titulo = (() => {
  if (!buildDate) return `LoginHUB v${versao}`;
  const d = new Date(buildDate);
  const stamp = Number.isNaN(d.getTime()) ? buildDate : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return `LoginHUB v${versao} — build de ${stamp}`;
})();
</script>

<template>
  <span
    class="pointer-events-auto fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-2 z-[45] select-none rounded-md bg-fill-2 px-2 py-1 font-mono text-caption-2 text-label-2"
    :title="titulo"
  >
    v{{ versao }}
  </span>
</template>
