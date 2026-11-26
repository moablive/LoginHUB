<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  ArrowsUpDownIcon,
  ChevronDoubleUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  EllipsisVerticalIcon,
  PencilSquareIcon,
  PlusIcon,
  ArrowRightOnRectangleIcon,
  Squares2X2Icon,
  TrashIcon,
  UserPlusIcon,
} from '@heroicons/vue/24/outline';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiButton from '@/components/ui/UiButton.vue';
import CofreIcone from './CofreIcone.vue';

/**
 * Lista dos cofres no molde do Proton Pass (20/11/2026, pedido do dono):
 * "Todos os itens" em cima, um cofre por linha com ícone, cor e total, o +
 * que cria e o menu ⋮ de cada um. No computador é a coluna da esquerda do
 * cofre; no celular vem dentro de uma folha.
 *
 * 23/11/2026 (pedido do dono, que tem muitos cofres): tocar no ÍCONE abre a
 * folha de nome, ícone e cor; e o modo ORDENAR (botão das setas, ou "Mover" no
 * menu) troca o ⋮ por subir, descer e ir para o topo. A ordem só é gravada no
 * "Salvar ordem", de uma vez.
 *
 * 26/11/2026 (db/022): "Compartilhar" no menu de cada cofre e, embaixo, o grupo "Compartilhados comigo" (cofres de
 * outras contas, com o papel: leitura ou escrita). Esses não se editam, ordenam nem apagam: só se SAI deles.
 */
interface CofreDaLista {
  id: string;
  nome: string;
  icone?: string;
  cor?: string;
  imagem?: string;
}

const props = defineProps<{
  cofres: CofreDaLista[];
  /** Total de itens por id de cofre. */
  contagem: Record<string, number>;
  total: number;
  /** Cofre escolhido; `null` = todos os itens. */
  atual: string | null;
  /** Gravando (a ordem, por exemplo): trava os botões. */
  ocupado?: boolean;
  /** Cofres de outras contas compartilhados com esta (db/022). */
  compartilhados?: (CofreDaLista & { papel: 'leitura' | 'escrita'; donoNome: string | null })[];
  /** Quantas pessoas, além do dono, abrem cada cofre próprio (id → n). */
  pessoas?: Record<string, number>;
}>();

const emit = defineEmits<{
  escolher: [id: string | null];
  novo: [];
  editar: [id: string];
  apagar: [id: string];
  /** Os ids de todos os cofres, na ordem nova. */
  reordenar: [ids: string[]];
  compartilhar: [id: string];
  /** O membro sai de um cofre compartilhado com ele. */
  sair: [id: string];
}>();

const pessoasDe = (id: string): string => {
  const n = props.pessoas?.[id] ?? 0;
  return n === 0 ? '' : n === 1 ? ' · com 1 pessoa' : ` · com ${n} pessoas`;
};

const quantos = (n: number) => (n === 1 ? '1 item' : `${n} itens`);

const menuDe = ref<string | null>(null);
const fecharMenu = () => (menuDe.value = null);
const aoTeclar = (e: KeyboardEvent) => {
  if (e.key === 'Escape') fecharMenu();
};
onMounted(() => {
  window.addEventListener('pointerdown', fecharMenu);
  window.addEventListener('keydown', aoTeclar);
});
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', fecharMenu);
  window.removeEventListener('keydown', aoTeclar);
});

function acao(tipo: 'editar' | 'apagar' | 'mover' | 'compartilhar' | 'sair', id: string) {
  fecharMenu();
  if (tipo === 'editar') emit('editar', id);
  else if (tipo === 'compartilhar') emit('compartilhar', id);
  else if (tipo === 'sair') emit('sair', id);
  else if (tipo === 'apagar') emit('apagar', id);
  else ordenar();
}

// --- ordenar: a ordem nova fica só aqui até o "Salvar ordem"
const ordem = ref<string[] | null>(null);
const visiveis = computed<CofreDaLista[]>(() => {
  const ids = ordem.value;
  if (!ids) return props.cofres;
  return ids.flatMap((id) => props.cofres.find((c) => c.id === id) ?? []);
});
function ordenar() {
  ordem.value = props.cofres.map((c) => c.id);
}
function mover(de: number, para: number) {
  const ids = ordem.value;
  if (!ids || para < 0 || para >= ids.length || de === para) return;
  const novo = [...ids];
  const [id] = novo.splice(de, 1);
  if (id === undefined) return;
  novo.splice(para, 0, id);
  ordem.value = novo;
}
const mudou = computed(() => !!ordem.value && ordem.value.some((id, i) => props.cofres[i]?.id !== id));
function salvarOrdem() {
  const ids = ordem.value;
  if (ids && mudou.value) emit('reordenar', ids);
  ordem.value = null;
}
</script>

<template>
  <nav aria-label="Cofres" class="rounded-celula bg-surface p-2">
    <div v-if="ordem" class="flex items-center justify-between gap-2 pb-1 pl-2">
      <h2 class="text-subhead font-semibold text-label-2">Ordenar</h2>
      <div class="flex gap-1">
        <UiButton variante="plain" tamanho="small" @click="ordem = null">Cancelar</UiButton>
        <UiButton variante="tinted" tamanho="small" :disabled="!mudou" @click="salvarOrdem">Salvar ordem</UiButton>
      </div>
    </div>
    <div v-else class="flex items-center justify-between pl-2">
      <h2 class="text-subhead font-semibold text-label-2">Cofres</h2>
      <div class="flex">
        <UiButton v-if="cofres.length > 1" variante="plain" icone aria-label="Ordenar os cofres" title="Ordenar os cofres" :disabled="ocupado" @click="ordenar">
          <ArrowsUpDownIcon class="h-6 w-6" />
        </UiButton>
        <UiButton variante="plain" icone aria-label="Novo cofre" title="Novo cofre" @click="emit('novo')">
          <PlusIcon class="h-6 w-6" />
        </UiButton>
      </div>
    </div>

    <!-- Muitos cofres (24/11/2026, pedido do dono): no computador e no app instalado a lista rola dentro da coluna,
         com a barra sempre à vista, e "Todos os itens" fica preso no topo. No celular quem rola é a folha. -->
    <ul class="rolagem-visivel space-y-1 lg:max-h-[calc(100dvh-11rem)] lg:overflow-y-auto lg:pr-1">
      <li v-if="!ordem" class="lg:sticky lg:top-0 lg:z-10 lg:bg-surface">
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-controle px-2 py-2 text-left"
          :class="atual === null ? 'bg-accent/15' : 'hover:bg-fill-2'"
          :aria-current="atual === null ? 'true' : undefined"
          @click="emit('escolher', null)"
        >
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent" aria-hidden="true">
            <Squares2X2Icon class="h-5 w-5" />
          </span>
          <span class="min-w-0">
            <span class="block truncate text-headline font-semibold">Todos os itens</span>
            <span class="block text-footnote text-label-2">{{ quantos(total) }}</span>
          </span>
        </button>
      </li>

      <li v-for="(c, i) in visiveis" :key="c.id" class="relative">
        <!-- ordenar: subir, descer, topo -->
        <div v-if="ordem" class="flex items-center gap-2 rounded-controle py-1 pl-2">
          <CofreIcone :icone="c.icone" :cor="c.cor" :imagem="c.imagem" />
          <span class="min-w-0 flex-1 truncate text-headline font-semibold">{{ c.nome }}</span>
          <div class="flex shrink-0">
            <button type="button" class="flex h-toque w-9 items-center justify-center rounded-full text-label-2 hover:bg-fill-2 hover:text-label disabled:opacity-30" :aria-label="`${c.nome}: para o topo`" title="Para o topo" :disabled="i === 0" @click="mover(i, 0)">
              <ChevronDoubleUpIcon class="h-5 w-5" />
            </button>
            <button type="button" class="flex h-toque w-9 items-center justify-center rounded-full text-accent hover:bg-accent/10 disabled:opacity-30" :aria-label="`${c.nome}: subir`" title="Subir" :disabled="i === 0" @click="mover(i, i - 1)">
              <ChevronUpIcon class="h-5 w-5" />
            </button>
            <button type="button" class="flex h-toque w-9 items-center justify-center rounded-full text-accent hover:bg-accent/10 disabled:opacity-30" :aria-label="`${c.nome}: descer`" title="Descer" :disabled="i === visiveis.length - 1" @click="mover(i, i + 1)">
              <ChevronDownIcon class="h-5 w-5" />
            </button>
          </div>
        </div>

        <template v-else>
          <div class="flex items-center rounded-controle" :class="c.id === atual ? 'bg-accent/15' : 'hover:bg-fill-2'">
            <!-- o ícone é o atalho para mudar nome, ícone e cor -->
            <button
              type="button"
              class="ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:ring-2 hover:ring-accent/40"
              :aria-label="`Mudar o nome, o ícone e a cor do cofre ${c.nome}`"
              title="Mudar o nome, o ícone e a cor"
              @click="emit('editar', c.id)"
            >
              <CofreIcone :icone="c.icone" :cor="c.cor" :imagem="c.imagem" />
            </button>
            <button
              type="button"
              class="min-w-0 flex-1 rounded-controle px-3 py-2 text-left"
              :aria-current="c.id === atual ? 'true' : undefined"
              @click="emit('escolher', c.id)"
            >
              <span class="block truncate text-headline font-semibold">{{ c.nome }}</span>
              <span class="block text-footnote text-label-2">{{ quantos(contagem[c.id] ?? 0) }}{{ pessoasDe(c.id) }}</span>
            </button>
            <button
              type="button"
              class="flex h-toque w-toque shrink-0 items-center justify-center rounded-full text-label-2 hover:text-label"
              :aria-label="`Opções do cofre ${c.nome}`"
              aria-haspopup="menu"
              :aria-expanded="menuDe === c.id"
              @pointerdown.stop
              @click="menuDe = menuDe === c.id ? null : c.id"
            >
              <EllipsisVerticalIcon class="h-6 w-6" />
            </button>
          </div>

          <div
            v-if="menuDe === c.id"
            role="menu"
            class="absolute right-2 top-12 z-20 w-56 overflow-hidden rounded-controle bg-surface-2 shadow-flutuante ring-1 ring-separator"
            @pointerdown.stop
          >
            <button type="button" role="menuitem" class="flex min-h-toque w-full items-center gap-2 px-3 text-left text-subhead hover:bg-fill-2" @click="acao('editar', c.id)">
              <PencilSquareIcon class="h-5 w-5 text-label-2" />Nome, ícone e cor
            </button>
            <button type="button" role="menuitem" class="flex min-h-toque w-full items-center gap-2 px-3 text-left text-subhead hover:bg-fill-2" @click="acao('compartilhar', c.id)">
              <UserPlusIcon class="h-5 w-5 text-label-2" />Compartilhar
            </button>
            <button v-if="cofres.length > 1" type="button" role="menuitem" class="flex min-h-toque w-full items-center gap-2 px-3 text-left text-subhead hover:bg-fill-2" @click="acao('mover', c.id)">
              <ArrowsUpDownIcon class="h-5 w-5 text-label-2" />Mover (ordenar os cofres)
            </button>
            <button type="button" role="menuitem" class="flex min-h-toque w-full items-center gap-2 px-3 text-left text-subhead text-danger hover:bg-danger/10" @click="acao('apagar', c.id)">
              <TrashIcon class="h-5 w-5" />Apagar
            </button>
          </div>
        </template>
      </li>

      <!-- Cofres de outras contas (db/022): só se escolhe e se sai; o dono é quem edita e apaga. -->
      <template v-if="!ordem && compartilhados && compartilhados.length > 0">
        <li class="px-2 pt-3 text-subhead font-semibold text-label-2">Compartilhados comigo</li>
        <li v-for="c in compartilhados" :key="c.id" class="relative">
          <div class="flex items-center rounded-controle" :class="c.id === atual ? 'bg-accent/15' : 'hover:bg-fill-2'">
            <span class="ml-2 flex h-10 w-10 shrink-0 items-center justify-center">
              <CofreIcone :icone="c.icone" :cor="c.cor" :imagem="c.imagem" />
            </span>
            <button type="button" class="min-w-0 flex-1 rounded-controle px-3 py-2 text-left" :aria-current="c.id === atual ? 'true' : undefined" @click="emit('escolher', c.id)">
              <span class="flex items-center gap-2">
                <span class="block truncate text-headline font-semibold">{{ c.nome }}</span>
                <UiBadge :tom="c.papel === 'escrita' ? 'accent' : 'neutro'">{{ c.papel === 'escrita' ? 'Leitura e escrita' : 'Somente leitura' }}</UiBadge>
              </span>
              <span class="block truncate text-footnote text-label-2">{{ quantos(contagem[c.id] ?? 0) }} · de {{ c.donoNome ?? 'outra conta' }}</span>
            </button>
            <button
              type="button"
              class="flex h-toque w-toque shrink-0 items-center justify-center rounded-full text-label-2 hover:text-label"
              :aria-label="`Opções do cofre ${c.nome}`"
              aria-haspopup="menu"
              :aria-expanded="menuDe === c.id"
              @pointerdown.stop
              @click="menuDe = menuDe === c.id ? null : c.id"
            >
              <EllipsisVerticalIcon class="h-6 w-6" />
            </button>
          </div>
          <div v-if="menuDe === c.id" role="menu" class="absolute right-2 top-12 z-20 w-56 overflow-hidden rounded-controle bg-surface-2 shadow-flutuante ring-1 ring-separator" @pointerdown.stop>
            <button type="button" role="menuitem" class="flex min-h-toque w-full items-center gap-2 px-3 text-left text-subhead text-danger hover:bg-danger/10" @click="acao('sair', c.id)">
              <ArrowRightOnRectangleIcon class="h-5 w-5" />Sair do cofre
            </button>
          </div>
        </li>
      </template>
    </ul>
  </nav>
</template>
