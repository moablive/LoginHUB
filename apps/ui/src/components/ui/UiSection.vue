<script setup lang="ts">
/**
 * Seção agrupada do iOS ("inset grouped"): rótulo pequeno acima, caixa branca
 * de cantos de 10px e nota de rodapé embaixo. Agrupar com espaço e caixa, não
 * com borda pesada (HIG › Layout).
 *
 * `lista` tira o padding interno para receber linhas (UiRow) que se dividem
 * por linha fina; sem ele a caixa tem respiro de 16px para conteúdo livre.
 */
defineProps<{ titulo?: string; rodape?: string; lista?: boolean }>();
</script>

<template>
  <section class="w-full">
    <div v-if="titulo || $slots.acao" class="mb-1.5 flex min-h-[28px] items-end justify-between gap-3 px-4">
      <h3 v-if="titulo" class="text-footnote font-medium uppercase tracking-wide text-label-2">{{ titulo }}</h3>
      <slot name="acao" />
    </div>
    <div
      class="overflow-hidden rounded-celula bg-surface"
      :class="lista ? 'divide-y [&>*]:border-separator' : 'p-4'"
    >
      <slot />
    </div>
    <p v-if="rodape || $slots.rodape" class="mt-1.5 px-4 text-footnote text-label-2">
      <slot name="rodape">{{ rodape }}</slot>
    </p>
  </section>
</template>
