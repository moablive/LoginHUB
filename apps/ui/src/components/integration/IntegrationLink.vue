<script setup lang="ts">
import { computed } from 'vue';
import { ArrowLongRightIcon, ArrowsRightLeftIcon, ServerStackIcon, ShieldCheckIcon } from '@heroicons/vue/24/outline';
import { directionLabel, getAppIntegration } from '@/config/integrations';

/**
 * Desenha o vínculo por inteiro: os dois lados que se conversam, o sentido das
 * chamadas e o que a integração faz. Versão longa do `IntegrationBadge`, para
 * onde sobra espaço (cabeçalho de página) — não use dentro de tabela.
 */
const props = defineProps<{
  /** Id do aplicativo no hub. Sem vínculo cadastrado, nada é desenhado. */
  appId?: string;
  /** Nome do app no hub, exibido ao lado do desenho. */
  appName?: string;
}>();

const integracao = computed(() => getAppIntegration(props.appId));
const no = 'inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-subhead font-semibold ring-1 ring-separator';
</script>

<template>
  <div v-if="integracao" class="rounded-celula bg-indigo/10 p-4">
    <div class="flex flex-wrap items-center gap-3">
      <span :class="no"><ShieldCheckIcon class="h-4 w-4 text-indigo" />LoginHUB</span>
      <span class="flex items-center text-indigo" :title="directionLabel(integracao.direction)">
        <component :is="integracao.direction === 'two-way' ? ArrowsRightLeftIcon : ArrowLongRightIcon" class="h-5 w-5" />
      </span>
      <span :class="no">
        <ServerStackIcon class="h-4 w-4 text-indigo" />
        <span class="flex flex-col leading-tight">
          {{ integracao.apiName }}
          <span class="font-mono text-caption-2 font-normal text-label-2">{{ integracao.apiHost }}</span>
        </span>
      </span>
      <span v-if="appName" class="text-footnote text-label-2">
        vínculo do aplicativo <strong class="text-label">{{ appName }}</strong>
      </span>
    </div>

    <p class="mt-3 text-subhead text-label-2">{{ integracao.summary }}</p>
    <ul class="mt-2 space-y-1 text-footnote text-label-2">
      <li v-for="item in integracao.capabilities" :key="item" class="flex gap-2"><span class="text-indigo">▸</span>{{ item }}</li>
    </ul>
  </div>
</template>
