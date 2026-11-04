<script setup lang="ts">
import { computed } from 'vue';
import { ArrowLongRightIcon, ArrowsRightLeftIcon } from '@heroicons/vue/24/outline';
import { directionLabel, getAppIntegration } from '@/config/integrations';

/**
 * Selo de vínculo: marca, na lista de aplicativos, quais deles têm uma API
 * conversando com o LoginHUB por trás. O ponto pulsando é o vínculo vivo; a
 * seta diz para que lado as chamadas saem (⇄ mão dupla, → só o app chama o hub).
 *
 * Os detalhes ficam no `title` porque a linha da tabela vive dentro de um
 * `overflow-x-auto` — um balão posicionado seria cortado na borda. Onde há
 * espaço, use `IntegrationLink`.
 */
const props = defineProps<{
  /** Id do aplicativo no hub. Sem vínculo cadastrado, o selo não aparece. */
  appId?: string;
}>();

const integracao = computed(() => getAppIntegration(props.appId));
const tooltip = computed(() => {
  const i = integracao.value;
  if (!i) return '';
  return [`${i.apiName} (${i.apiHost})`, directionLabel(i.direction), '', i.summary, '', ...i.capabilities.map((item) => `• ${item}`)].join('\n');
});
</script>

<template>
  <span
    v-if="integracao"
    :title="tooltip"
    class="inline-flex cursor-help items-center gap-1.5 whitespace-nowrap rounded-full bg-indigo/15 px-2 py-0.5 text-caption-2 font-semibold uppercase tracking-wide text-indigo"
  >
    <span class="relative flex h-1.5 w-1.5">
      <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo opacity-75" />
      <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-indigo" />
    </span>
    <component :is="integracao.direction === 'two-way' ? ArrowsRightLeftIcon : ArrowLongRightIcon" class="h-3 w-3" />
    API vinculada
  </span>
</template>
