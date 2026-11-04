<script setup lang="ts">
import { computed } from 'vue';
import { ArrowLongRightIcon, CubeIcon, UserIcon } from '@heroicons/vue/24/outline';
import { getAppLinks, linkDirectionLabel } from '@/config/appLinks';

/**
 * Desenha por inteiro o vínculo entre dois apps clientes: quem serve, quem lê e
 * o que a pessoa passa a enxergar. Versão longa do `AppLinkBadge`, para o
 * cabeçalho da página de usuários — não use dentro de tabela.
 *
 * Fica justamente na tela onde se convida gente, e por isso repete em destaque
 * o que mais confunde: o vínculo é por pessoa. Convidar alguém para um dos apps
 * não lhe dá o outro nem faz o outro aparecer na tela dele.
 */
const props = defineProps<{
  /** Id do aplicativo no hub. Sem vínculo cadastrado, nada é desenhado. */
  appId?: string;
}>();

const vistas = computed(() => getAppLinks(props.appId));
const no = 'inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-subhead font-semibold ring-1 ring-separator';
</script>

<template>
  <div v-if="vistas.length" class="space-y-3">
    <div v-for="view in vistas" :key="`${view.link.providerId}-${view.link.consumerId}`" class="rounded-celula bg-warning/10 p-4">
      <div class="flex flex-wrap items-center gap-3">
        <span :class="no"><CubeIcon class="h-4 w-4 text-warning" />{{ view.link.providerName }}</span>
        <span class="flex items-center text-warning" :title="linkDirectionLabel(view)">
          <ArrowLongRightIcon class="h-5 w-5" />
        </span>
        <span :class="no"><CubeIcon class="h-4 w-4 text-warning" />{{ view.link.consumerName }}</span>
        <span class="text-footnote text-label-2">
          vínculo entre aplicativos —
          <strong class="text-label">{{ view.side === 'provider' ? 'este serve os dados' : 'este lê os dados' }}</strong>
        </span>
      </div>

      <p class="mt-3 text-subhead text-label-2">{{ view.link.summary }}</p>
      <p class="mt-2 text-footnote text-label-2"><span class="font-semibold text-label">Dados:</span> {{ view.link.data }}</p>

      <!-- O aviso que evita a pergunta de sempre na hora de convidar. -->
      <div class="mt-3 flex items-start gap-2 rounded-lg bg-surface px-3 py-2">
        <UserIcon class="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p class="text-footnote">
          <strong>O vínculo é por pessoa, não pelo aplicativo.</strong> {{ view.link.optIn }} Quem tem conta só de um lado
          não vê nada do outro.
        </p>
      </div>

      <ul class="mt-2 space-y-1 text-footnote text-label-2">
        <li v-for="item in view.link.capabilities" :key="item" class="flex gap-2"><span class="text-warning">▸</span>{{ item }}</li>
      </ul>

      <p class="mt-2 font-mono text-caption-2 text-label-2">{{ view.link.ledger }}</p>
    </div>
  </div>
</template>
