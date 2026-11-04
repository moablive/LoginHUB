<script setup lang="ts">
import { computed } from 'vue';
import { ArrowLongLeftIcon, ArrowLongRightIcon } from '@heroicons/vue/24/outline';
import { getAppLinks, linkBadgeLabel, linkDirectionLabel, type AppLinkView } from '@/config/appLinks';

/**
 * Selo de vínculo entre dois apps clientes: diz que os dados de um aparecem
 * dentro do outro, e para que lado eles correm.
 *
 * Deliberadamente diferente do `IntegrationBadge` (índigo, ponto pulsando):
 * aquele é vínculo do app com o hub, ligado o tempo todo. Este é laranja e o
 * ponto não pulsa porque o vínculo não vale para o aplicativo inteiro — vale
 * para cada pessoa que tenha conta dos dois lados, uma a uma. Confundir os dois
 * faria o painel prometer a usuário novo um vínculo que ele não tem.
 *
 * Os detalhes ficam no `title` pelo mesmo motivo do outro selo: a linha da
 * tabela vive dentro de um `overflow-x-auto` e cortaria um balão posicionado.
 */
const props = defineProps<{
  /** Id do aplicativo no hub. Sem vínculo cadastrado, o selo não aparece. */
  appId?: string;
}>();

const vistas = computed(() => getAppLinks(props.appId));

function tooltip(view: AppLinkView) {
  return [
    `${view.link.providerName} → ${view.link.consumerName}`,
    linkDirectionLabel(view),
    '',
    view.link.summary,
    `Dados: ${view.link.data}`,
    '',
    `Vínculo por pessoa: ${view.link.optIn}`,
    `Onde fica: ${view.link.ledger}`,
    '',
    ...view.link.capabilities.map((item) => `• ${item}`),
  ].join('\n');
}
</script>

<template>
  <span
    v-for="view in vistas"
    :key="`${view.link.providerId}-${view.link.consumerId}`"
    :title="tooltip(view)"
    class="inline-flex cursor-help items-center gap-1.5 whitespace-nowrap rounded-full bg-warning/15 px-2 py-0.5 text-caption-2 font-semibold uppercase tracking-wide text-warning"
  >
    <span class="inline-flex h-1.5 w-1.5 rounded-full bg-warning" />
    <component :is="view.side === 'provider' ? ArrowLongRightIcon : ArrowLongLeftIcon" class="h-3 w-3" />
    {{ linkBadgeLabel(view) }}
  </span>
</template>
