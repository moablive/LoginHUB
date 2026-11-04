<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowPathIcon, DevicePhoneMobileIcon, LockOpenIcon } from '@heroicons/vue/24/outline';
import { aparelhoApi } from '@loginhub/api-client';
import type { AparelhosDoApp } from '@loginhub/schema';
import UiSection from '@/components/ui/UiSection.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiAlert from '@/components/ui/UiAlert.vue';

/**
 * Um aparelho por conta de CPF (04/11/2026, pedido do dono da Sul Alimentos).
 *
 * O hub prende cada conta de CPF ao aparelho do primeiro login completo e
 * recusa os outros (`AparelhoService`). Aqui o administrador do hub vê quem
 * está em qual aparelho (nome + IP), o registro dos logins, e solta a conta
 * pelo Liberar — o app dono tem a mesma tela (a Sul, em Lista negra › Aparelhos).
 *
 * Os dados vêm da página (`AppUsersPage`), que também mostra o aparelho na
 * linha de cada usuário; depois de liberar, o painel pede para recarregar.
 */
const props = defineProps<{ appId: string | undefined; dados: AparelhosDoApp; carregando: boolean; erro: string }>();
const emit = defineEmits<{ recarregar: [] }>();

type Preso = AparelhosDoApp['presos'][number];

const aLiberar = ref<Preso | null>(null);
const liberando = ref(false);
const erroLiberar = ref('');
const verRegistro = ref(false);

const registro = computed(() => props.dados.registro.slice(0, 60));

const ROTULO: Record<string, string> = { entrou: 'Entrou', recusado: 'Recusado', saiu: 'Saiu', liberado: 'Liberado' };
const TOM: Record<string, 'success' | 'danger' | 'neutro' | 'warning'> = { entrou: 'success', recusado: 'danger', saiu: 'neutro', liberado: 'warning' };

function quando(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function liberar() {
  const p = aLiberar.value;
  if (!p) return;
  liberando.value = true;
  erroLiberar.value = '';
  try {
    await aparelhoApi.liberar(p.usuarioId, 'painel do hub', props.appId);
    emit('recarregar');
  } catch {
    erroLiberar.value = 'Não foi possível liberar o aparelho.';
  } finally {
    liberando.value = false;
    aLiberar.value = null;
  }
}
</script>

<template>
  <UiSection titulo="Aparelhos conectados" lista>
    <template #acao>
      <UiButton variante="plain" tamanho="small" @click="emit('recarregar')">
        <ArrowPathIcon class="h-4 w-4" :class="carregando ? 'animate-spin' : ''" />
        Atualizar
      </UiButton>
    </template>

    <div class="flex items-start gap-3 px-4 py-3">
      <DevicePhoneMobileIcon class="mt-0.5 h-6 w-6 shrink-0 text-accent" />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <p class="text-headline font-semibold">Um aparelho por CPF</p>
          <UiBadge tom="neutro">{{ dados.presos.length }} conectado(s)</UiBadge>
        </div>
        <p class="mt-0.5 text-footnote text-label-2">
          Cada conta de CPF fica presa ao aparelho do primeiro login completo. Outro aparelho é recusado até a pessoa sair nele ou alguém tocar em Liberar.
        </p>
      </div>
    </div>

    <p v-if="erro || erroLiberar" role="alert" class="bg-danger/10 px-4 py-2.5 text-subhead text-danger">{{ erro || erroLiberar }}</p>

    <p v-if="!carregando && !dados.presos.length && !erro" class="px-4 py-3 text-subhead text-label-2">
      Nenhum CPF conectado em aparelho agora.
    </p>

    <div v-for="p in dados.presos" :key="p.usuarioId" class="flex flex-wrap items-center gap-3 px-4 py-3">
      <DevicePhoneMobileIcon class="h-5 w-5 shrink-0 text-label-2" />
      <div class="min-w-0 flex-1">
        <p class="truncate text-subhead font-medium">{{ p.nome }} <span class="font-mono text-footnote font-normal text-label-2">{{ p.conta }}</span></p>
        <p class="text-footnote text-label-2">
          {{ p.aparelhoNome || 'aparelho sem nome' }}
          <template v-if="p.ip"> · IP <span class="font-mono">{{ p.ip }}</span></template>
          · desde {{ quando(p.desde) }} · último acesso {{ quando(p.ultimoAcesso) }}
        </p>
      </div>
      <UiButton variante="tinted" tamanho="small" :carregando="liberando && aLiberar?.usuarioId === p.usuarioId" @click="aLiberar = p">
        <LockOpenIcon class="h-4 w-4" />
        Liberar
      </UiButton>
    </div>

    <template v-if="dados.registro.length">
      <button
        type="button"
        class="flex w-full items-center justify-between bg-fill-2 px-4 pb-1 pt-3 text-left text-caption-1 font-medium uppercase tracking-wide text-label-2"
        @click="verRegistro = !verRegistro"
      >
        Registro dos logins por aparelho ({{ dados.registro.length }})
        <span class="normal-case">{{ verRegistro ? 'esconder' : 'mostrar' }}</span>
      </button>
      <template v-if="verRegistro">
        <div v-for="r in registro" :key="r.id" class="flex min-h-toque flex-wrap items-center gap-2 px-4 py-2 text-footnote text-label-2">
          <UiBadge :tom="TOM[r.evento] ?? 'neutro'">{{ ROTULO[r.evento] ?? r.evento }}</UiBadge>
          <span class="font-medium text-label">{{ r.nome || r.conta }}</span>
          <span>{{ r.aparelhoNome || 'aparelho sem nome' }}</span>
          <span v-if="r.ip" class="font-mono">{{ r.ip }}</span>
          <span v-if="r.detalhe">— {{ r.detalhe }}</span>
          <span class="ml-auto">{{ quando(r.criadoEm) }}</span>
        </div>
      </template>
    </template>
  </UiSection>

  <UiAlert
    :aberto="!!aLiberar"
    tom="warning"
    :icone="LockOpenIcon"
    :titulo="aLiberar ? `Liberar ${aLiberar.nome}?` : ''"
    :mensagem="aLiberar ? `A conta sai de “${aLiberar.aparelhoNome || 'aparelho sem nome'}”. O próximo login dela, de qualquer aparelho, fica preso a ele.` : ''"
    confirmar="Liberar"
    :carregando="liberando"
    texto-carregando="Liberando…"
    @fechar="aLiberar = null"
    @confirmar="liberar"
  />
</template>
