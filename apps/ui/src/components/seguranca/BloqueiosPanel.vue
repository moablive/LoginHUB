<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowPathIcon, GlobeAltIcon, LockOpenIcon, ShieldExclamationIcon, UserIcon } from '@heroicons/vue/24/outline';
import { bloqueioApi } from '@loginhub/api-client';
import type { LoginBloqueio } from '@loginhub/schema';
import UiSection from '@/components/ui/UiSection.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiAlert from '@/components/ui/UiAlert.vue';

/**
 * Lista negra do login de um app (28/10/2026).
 *
 * A regra mora no hub (`BloqueioService`): 5 senhas ou códigos 2FA errados do
 * mesmo IP bloqueiam o IP; 10 erros na mesma conta em 1 h bloqueiam a conta;
 * nada expira — só o botão Liberar solta. O app dono tem a mesma lista no
 * painel dele (a Sul, por exemplo, em "Lista negra"); aqui é a visão do
 * administrador do hub, para socorrer quando o app não alcança.
 */
const props = defineProps<{ appId: string | undefined }>();

const itens = ref<LoginBloqueio[]>([]);
const carregando = ref(true);
const erro = ref('');
const liberando = ref<number | null>(null);
// Confirmação no alerta do painel, no lugar do window.confirm de antes.
const aLiberar = ref<LoginBloqueio | null>(null);

function quando(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function carregar() {
  if (!props.appId) return;
  try {
    itens.value = await bloqueioApi.getByAppId(props.appId);
    erro.value = '';
  } catch {
    erro.value = 'Não foi possível carregar a lista negra.';
  } finally {
    carregando.value = false;
  }
}

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void carregar();
  timer = setInterval(() => void carregar(), 30000);
});
onBeforeUnmount(() => clearInterval(timer));
watch(() => props.appId, () => void carregar());

const bloqueados = computed(() => itens.value.filter((b) => b.bloqueadoEm && !b.liberadoEm));
const emContagem = computed(() => itens.value.filter((b) => !b.bloqueadoEm && !b.liberadoEm));
const liberados = computed(() => itens.value.filter((b) => b.liberadoEm));

const quem = (b: LoginBloqueio) => (b.tipo === 'ip' ? `o IP ${b.alvo}` : `a conta ${b.alvo}`);

async function liberar() {
  const b = aLiberar.value;
  if (!b) return;
  liberando.value = b.id;
  try {
    await bloqueioApi.liberar(b.id, 'painel do hub', props.appId);
    await carregar();
  } catch {
    erro.value = 'Não foi possível liberar.';
  } finally {
    liberando.value = null;
    aLiberar.value = null;
  }
}
</script>

<template>
  <UiSection titulo="Lista negra do login" lista>
    <template #acao>
      <UiButton variante="plain" tamanho="small" @click="carregar">
        <ArrowPathIcon class="h-4 w-4" :class="carregando ? 'animate-spin' : ''" />
        Atualizar
      </UiButton>
    </template>

    <div class="flex items-start gap-3 px-4 py-3">
      <ShieldExclamationIcon class="mt-0.5 h-6 w-6 shrink-0 text-danger" />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <p class="text-headline font-semibold">Bloqueios</p>
          <UiBadge :tom="bloqueados.length ? 'danger' : 'neutro'">{{ bloqueados.length }} bloqueado(s)</UiBadge>
        </div>
        <p class="mt-0.5 text-footnote text-label-2">
          5 senhas ou códigos errados do mesmo IP bloqueiam o IP; 10 erros na mesma conta em 1 h bloqueiam a conta. Só sai por Liberar.
        </p>
      </div>
    </div>

    <p v-if="erro" role="alert" class="bg-danger/10 px-4 py-2.5 text-subhead text-danger">{{ erro }}</p>

    <p v-if="!carregando && !bloqueados.length && !emContagem.length && !liberados.length" class="px-4 py-3 text-subhead text-label-2">
      Ninguém bloqueado, ninguém errando.
    </p>

    <div v-for="b in bloqueados" :key="b.id" class="flex flex-wrap items-center gap-3 px-4 py-3">
      <GlobeAltIcon v-if="b.tipo === 'ip'" class="h-5 w-5 shrink-0 text-label-2" />
      <UserIcon v-else class="h-5 w-5 shrink-0 text-label-2" />
      <div class="min-w-0 flex-1">
        <p class="truncate font-mono text-subhead">{{ b.alvo }}</p>
        <p class="text-footnote text-label-2">
          {{ b.tentativas }} tentativas ({{ b.origem === '2fa' ? 'código 2FA' : 'senha' }}) · bloqueado {{ quando(b.bloqueadoEm) }}
          <template v-if="b.detalhe">
            · {{ b.tipo === 'ip' ? 'última conta' : 'último IP' }}: <span class="font-mono">{{ b.detalhe }}</span>
          </template>
        </p>
      </div>
      <UiButton variante="tinted" tamanho="small" :carregando="liberando === b.id" @click="aLiberar = b">
        <LockOpenIcon v-if="liberando !== b.id" class="h-4 w-4" />
        Liberar
      </UiButton>
    </div>

    <template v-if="emContagem.length">
      <p class="bg-fill-2 px-4 pb-1 pt-3 text-caption-1 font-medium uppercase tracking-wide text-label-2">Errando, ainda sem bloqueio</p>
      <div v-for="b in emContagem" :key="b.id" class="flex min-h-toque items-center gap-3 px-4 py-2 text-label-2">
        <GlobeAltIcon v-if="b.tipo === 'ip'" class="h-5 w-5 shrink-0" />
        <UserIcon v-else class="h-5 w-5 shrink-0" />
        <p class="min-w-0 flex-1 truncate font-mono text-subhead text-label">{{ b.alvo }}</p>
        <p class="shrink-0 text-footnote">{{ b.tentativas }} de {{ b.tipo === 'ip' ? 5 : 10 }} · {{ quando(b.ultimaTentativa) }}</p>
      </div>
    </template>

    <template v-if="liberados.length">
      <p class="bg-fill-2 px-4 pb-1 pt-3 text-caption-1 font-medium uppercase tracking-wide text-label-2">Liberados (30 dias)</p>
      <div v-for="b in liberados" :key="b.id" class="flex min-h-toque items-center gap-3 px-4 py-2 text-label-2">
        <GlobeAltIcon v-if="b.tipo === 'ip'" class="h-5 w-5 shrink-0" />
        <UserIcon v-else class="h-5 w-5 shrink-0" />
        <p class="min-w-0 flex-1 truncate font-mono text-subhead line-through">{{ b.alvo }}</p>
        <p class="shrink-0 text-footnote">liberado {{ quando(b.liberadoEm) }}{{ b.liberadoPor ? ` por ${b.liberadoPor}` : '' }}</p>
      </div>
    </template>
  </UiSection>

  <UiAlert
    :aberto="!!aLiberar"
    tom="warning"
    :icone="LockOpenIcon"
    :titulo="aLiberar ? `Liberar ${quem(aLiberar)}?` : ''"
    mensagem="A pessoa volta a poder tentar entrar."
    confirmar="Liberar"
    :carregando="liberando !== null"
    texto-carregando="Liberando…"
    @fechar="aLiberar = null"
    @confirmar="liberar"
  />
</template>
