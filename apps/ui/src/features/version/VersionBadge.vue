<script setup lang="ts">
import { ref } from 'vue';

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
// Recarga forçada (20/11/2026, pedido do dono: todo PWA com o botão de recarregar e a versão à vista). O app instalado
// não tem o botão de recarregar do navegador: o botão ao lado da versão atualiza o service worker, esvazia os caches do app e
// recarrega a página, que volta do servidor na versão que está no ar.
const recarregando = ref(false);
async function recarregar() {
  if (recarregando.value) return;
  recarregando.value = true;
  try {
    const registro = await navigator.serviceWorker?.getRegistration();
    await registro?.update();
  } catch {
    /* sem service worker, ou bloqueado: segue para a recarga */
  }
  try {
    const nomes = await caches.keys();
    await Promise.all(nomes.map((n) => caches.delete(n)));
  } catch {
    /* sem Cache Storage (aba privada, http): segue para a recarga */
  }
  window.location.reload();
}
</script>

<template>
  <!-- Botão que força a recarga e, ao lado, a versão que está rodando (o mesmo par do app da Sul Alimentos). -->
  <div class="fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-2 z-[45] flex select-none items-center gap-1.5">
    <button
      type="button"
      class="pointer-events-auto inline-flex cursor-pointer items-center gap-1 rounded-md bg-fill-2 px-2 py-1 font-mono text-caption-2 text-label-2 disabled:cursor-wait disabled:opacity-70"
      title="Atualiza o service worker, descarta o cache do app e recarrega a página na versão que está no ar"
      :disabled="recarregando"
      :aria-busy="recarregando"
      @click="recarregar"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3 shrink-0" :class="{ 'animate-spin': recarregando }" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3.5-7.1" /><polyline points="21 3 21 9 15 9" /></svg>
      {{ recarregando ? 'Recarregando…' : 'Reload forçado' }}
    </button>
    <span class="pointer-events-auto rounded-md bg-fill-2 px-2 py-1 font-mono text-caption-2 text-label-2" :title="titulo">v{{ versao }}</span>
  </div>
</template>
