<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fundoDoLogo } from '@/config/logoFundo';

/**
 * Ícone de um item do cofre (19/11/2026, pedido do dono: o item mostra o ícone
 * da página, como todo cofre de senhas). Em 27/11/2026 ganhou o degrau 0, o ícone que o próprio usuário
 * escolheu (vai cifrado no item), e o favicon passou a tentar também o `apple-touch-icon.png`. Degraus:
 *   0. o usuário escolheu uma imagem para o item → ela;
 *   1. o endereço é o do próprio LoginHUB → o logo oficial dele (o ícone do PWA; o hub não está na lista de apps
 *      e não tem `/favicon.ico`, só o `.svg`);
 *   2. o endereço é de um aplicativo do hub → o logo cadastrado no hub (nada sai daqui);
 *   3. outro site → o `/favicon.ico` do próprio site, sem referrer (nenhum serviço de terceiros fica sabendo);
 *   4. sem endereço, ou o site não tem o arquivo → as iniciais do título.
 */
const LOGO_DO_HUB = '/pwa-192x192.png';
export interface LogoDeApp {
  id: string | number;
  host: string;
  logo: string;
}

const props = defineProps<{ titulo: string; url: string; apps: LogoDeApp[]; icone?: string }>();
// Só imagem embutida: o dado vem de dentro do cofre, mas nunca vira outro esquema de URL.
const proprio = computed(() => (props.icone && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(props.icone) ? props.icone : null));
const CAMINHOS_FAVICON = ['/favicon.ico', '/apple-touch-icon.png'];
const tentativa = ref(0);

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
watch(host, () => {
  falhou.value = false;
  tentativa.value = 0;
});
function erroNoIcone() {
  if (tentativa.value + 1 < CAMINHOS_FAVICON.length) tentativa.value += 1;
  else falhou.value = true;
}

const ehOHub = computed(() => host.value !== null && host.value === window.location.hostname.toLowerCase());

const src = computed(() => {
  if (proprio.value) return proprio.value;
  if (ehOHub.value) return LOGO_DO_HUB;
  if (doHub.value) return doHub.value.logo;
  return host.value && !falhou.value ? `https://${host.value}${CAMINHOS_FAVICON[tentativa.value]}` : null;
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
    class="h-10 w-10 shrink-0 rounded-[10px] object-contain ring-1 ring-separator"
    :class="ehOHub && !proprio ? '' : ['p-1', doHub ? fundoDoLogo(doHub.id) : 'bg-white']"
    @error="erroNoIcone"
  />
  <div v-else class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-accent/15 text-subhead font-bold text-accent" aria-hidden="true">
    {{ iniciais }}
  </div>
</template>
