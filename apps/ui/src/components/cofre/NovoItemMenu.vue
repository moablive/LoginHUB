<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { ChevronDownIcon, CreditCardIcon, IdentificationIcon, KeyIcon, PlusIcon } from '@heroicons/vue/24/outline';
import UiButton from '@/components/ui/UiButton.vue';
import type { TipoItem } from '@/features/cofre/tipos';

/** Botão "Item" com o menu Login · Cartão · Documento (28/11/2026). Fecha com Esc ou clicando fora. */
defineProps<{ desativado?: boolean; dica?: string | undefined }>();
const emit = defineEmits<{ novo: [tipo: TipoItem] }>();

const aberto = ref(false);
const raiz = ref<HTMLElement | null>(null);

const OPCOES: { tipo: TipoItem; titulo: string; texto: string; cor: string }[] = [
  { tipo: 'login', titulo: 'Login', texto: 'Senha, usuário e código 2FA', cor: 'bg-indigo' },
  { tipo: 'cartao', titulo: 'Cartão', texto: 'Crédito, débito ou virtual', cor: 'bg-warning' },
  { tipo: 'documento', titulo: 'Documento', texto: 'CNH, RG, CPF, passaporte e outros', cor: 'bg-success' },
];

function escolher(tipo: TipoItem) {
  aberto.value = false;
  emit('novo', tipo);
}
const aoClicarFora = (e: MouseEvent) => {
  if (aberto.value && raiz.value && !raiz.value.contains(e.target as Node)) aberto.value = false;
};
const aoTeclar = (e: KeyboardEvent) => {
  if (e.key === 'Escape') aberto.value = false;
};
onMounted(() => {
  document.addEventListener('click', aoClicarFora);
  document.addEventListener('keydown', aoTeclar);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', aoClicarFora);
  document.removeEventListener('keydown', aoTeclar);
});
</script>

<template>
  <div ref="raiz" class="relative">
    <UiButton tamanho="small" :disabled="desativado" :title="dica" aria-haspopup="menu" :aria-expanded="aberto" @click="aberto = !aberto">
      <PlusIcon class="h-4 w-4" />Item<ChevronDownIcon class="h-4 w-4" />
    </UiButton>
    <div v-if="aberto" role="menu" aria-label="Tipo de item" class="absolute right-0 top-full z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-celula border border-separator bg-surface p-1.5 shadow-xl">
      <button
        v-for="o in OPCOES"
        :key="o.tipo"
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-3 rounded-controle p-2 text-left hover:bg-fill-2 focus-visible:bg-fill-2"
        @click="escolher(o.tipo)"
      >
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] text-white" :class="o.cor" aria-hidden="true">
          <KeyIcon v-if="o.tipo === 'login'" class="h-5 w-5" /><CreditCardIcon v-else-if="o.tipo === 'cartao'" class="h-5 w-5" /><IdentificationIcon v-else class="h-5 w-5" />
        </span>
        <span class="min-w-0">
          <span class="block text-body font-semibold">{{ o.titulo }}</span>
          <span class="block text-footnote text-label-2">{{ o.texto }}</span>
        </span>
      </button>
    </div>
  </div>
</template>
