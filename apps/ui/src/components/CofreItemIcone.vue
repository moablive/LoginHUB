<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fundoDoLogo } from '@/config/logoFundo';

/**
 * Ícone de um item do cofre (19/11/2026, pedido do dono: o item mostra o ícone
 * da página, como todo cofre de senhas). Três degraus:
 *   1. o endereço é de um aplicativo do hub → o logo cadastrado no hub (nada sai daqui);
 *   2. outro site → o `/favicon.ico` do próprio site, sem referrer (nenhum serviço de terceiros fica sabendo);
 *   3. sem endereço, ou o site não tem o arquivo → as iniciais do título.
 */
export interface LogoDeApp {
  id: string | number;
  host: string;
  logo: string;
}

const props = defineProps<{ titulo: string; url: string; apps: LogoDeApp[] }>();

const host = computed<string | null>(() => {
  const u = props.url.trim();
  if (!u) return null;
  try {
    return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.toLowerCase();
  } catch {
    return null;
  }
});

const doHub = computed(() => props.apps.find((a) => a.host === host.value) ?? null);
const falhou = ref(false);
watch(host, () => (falhou.value = false));

const src = computed(() => {
  if (doHub.value) return doHub.value.logo;
  return host.value && !falhou.value ? `https://${host.value}/favicon.ico` : null;
});
const iniciais = computed(() => props.titulo.trim().substring(0, 2).toUpperCase() || '··');
</script>

<template>
  <img
    v-if="src"
    :src="src"
    alt=""
    aria-hidden="true"
    loading="lazy"
    referrerpolicy="no-referrer"
    class="h-10 w-10 shrink-0 rounded-[10px] object-contain p-1 ring-1 ring-separator"
    :class="doHub ? fundoDoLogo(doHub.id) : 'bg-white'"
    @error="falhou = true"
  />
  <div v-else class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-accent/15 text-subhead font-bold text-accent" aria-hidden="true">
    {{ iniciais }}
  </div>
</template>
