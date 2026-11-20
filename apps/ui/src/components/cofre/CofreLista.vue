<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { EllipsisVerticalIcon, PencilSquareIcon, PlusIcon, Squares2X2Icon, TrashIcon } from '@heroicons/vue/24/outline';
import UiButton from '@/components/ui/UiButton.vue';
import { estiloDoCofre, iconeDoCofre } from '@/features/cofre/aparencia';

/**
 * Lista dos cofres no molde do Proton Pass (20/11/2026, pedido do dono):
 * "Todos os itens" em cima, um cofre por linha com ícone, cor e total, o +
 * que cria e o menu ⋮ de cada um (editar, apagar). No computador é a coluna
 * da esquerda do cofre; no celular vem dentro de uma folha.
 */
defineProps<{
  cofres: { id: string; nome: string; icone?: string; cor?: string }[];
  /** Total de itens por id de cofre. */
  contagem: Record<string, number>;
  total: number;
  /** Cofre escolhido; `null` = todos os itens. */
  atual: string | null;
}>();

const emit = defineEmits<{
  escolher: [id: string | null];
  novo: [];
  editar: [id: string];
  apagar: [id: string];
}>();

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

function acao(tipo: 'editar' | 'apagar', id: string) {
  fecharMenu();
  if (tipo === 'editar') emit('editar', id);
  else emit('apagar', id);
}
</script>

<template>
  <nav aria-label="Cofres" class="rounded-celula bg-surface p-2">
    <div class="flex items-center justify-between pl-2">
      <h2 class="text-subhead font-semibold text-label-2">Cofres</h2>
      <UiButton variante="plain" icone aria-label="Novo cofre" title="Novo cofre" @click="emit('novo')">
        <PlusIcon class="h-6 w-6" />
      </UiButton>
    </div>

    <ul class="space-y-1">
      <li>
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

      <li v-for="c in cofres" :key="c.id" class="relative">
        <div class="flex items-center rounded-controle" :class="c.id === atual ? 'bg-accent/15' : 'hover:bg-fill-2'">
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-3 rounded-controle px-2 py-2 text-left"
            :aria-current="c.id === atual ? 'true' : undefined"
            @click="emit('escolher', c.id)"
          >
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" :style="estiloDoCofre(c.cor)" aria-hidden="true">
              <component :is="iconeDoCofre(c.icone)" class="h-5 w-5" />
            </span>
            <span class="min-w-0">
              <span class="block truncate text-headline font-semibold">{{ c.nome }}</span>
              <span class="block text-footnote text-label-2">{{ quantos(contagem[c.id] ?? 0) }}</span>
            </span>
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
          class="absolute right-2 top-12 z-20 w-44 overflow-hidden rounded-controle bg-surface-2 shadow-flutuante ring-1 ring-separator"
          @pointerdown.stop
        >
          <button type="button" role="menuitem" class="flex min-h-toque w-full items-center gap-2 px-3 text-left text-subhead hover:bg-fill-2" @click="acao('editar', c.id)">
            <PencilSquareIcon class="h-5 w-5 text-label-2" />Editar
          </button>
          <button type="button" role="menuitem" class="flex min-h-toque w-full items-center gap-2 px-3 text-left text-subhead text-danger hover:bg-danger/10" @click="acao('apagar', c.id)">
            <TrashIcon class="h-5 w-5" />Apagar
          </button>
        </div>
      </li>
    </ul>
  </nav>
</template>
