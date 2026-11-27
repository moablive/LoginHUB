<script setup lang="ts">
import { ref } from 'vue';
import { MoonIcon, SunIcon, SwatchIcon } from '@heroicons/vue/24/outline';
import { CORES_TEMA, useTema, type ModoTema } from '@/composables/useTema';

// Aparência (27/11/2026): modo claro, escuro ou colorido + cor de destaque (cores fixas ou personalizada).
const { modo, cor, definirModo, definirCor } = useTema();
const aberto = ref(false);

const MODOS: { id: ModoTema; nome: string }[] = [
  { id: 'claro', nome: 'Claro' },
  { id: 'escuro', nome: 'Escuro' },
  { id: 'colorido', nome: 'Colorido' },
];
const ehHex = (c: string) => c.startsWith('#');
function personalizada(e: Event) {
  definirCor((e.target as HTMLInputElement).value);
}
</script>

<template>
  <!-- Canto inferior direito, fora da barra de gestos (safe area). -->
  <div class="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-40" @keydown.esc="aberto = false">
    <div v-if="aberto" class="material absolute bottom-14 right-0 w-64 space-y-3 rounded-celula p-3 text-label shadow-flutuante ring-1 ring-separator" role="dialog" aria-label="Aparência">
      <p class="text-footnote font-semibold text-label-2">Modo</p>
      <div class="grid grid-cols-3 gap-1 rounded-controle bg-fill-2 p-1">
        <button
          v-for="m in MODOS"
          :key="m.id"
          type="button"
          class="rounded-lg px-2 py-1.5 text-footnote transition"
          :class="modo === m.id ? 'bg-accent text-white shadow-sm' : 'text-label hover:bg-fill'"
          :aria-pressed="modo === m.id"
          @click="definirModo(m.id)"
        >
          {{ m.nome }}
        </button>
      </div>
      <p class="text-footnote font-semibold text-label-2">Cor</p>
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="c in CORES_TEMA"
          :key="c.id"
          type="button"
          class="h-8 w-8 rounded-full ring-offset-2 ring-offset-[var(--fundo-2)] transition hover:scale-110"
          :class="cor === c.id ? 'ring-2 ring-label' : 'ring-1 ring-separator'"
          :style="{ backgroundColor: c.escuro }"
          :title="c.nome"
          :aria-label="c.nome"
          :aria-pressed="cor === c.id"
          @click="definirCor(c.id)"
        />
        <label
          class="relative flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full ring-offset-2 ring-offset-[var(--fundo-2)] transition hover:scale-110"
          :class="ehHex(cor) ? 'ring-2 ring-label' : 'ring-1 ring-separator'"
          :style="ehHex(cor) ? { backgroundColor: cor } : { background: 'conic-gradient(#ef4444, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444)' }"
          title="Cor personalizada"
        >
          <input type="color" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" :value="ehHex(cor) ? cor : '#0a84ff'" aria-label="Cor personalizada" @input="personalizada" />
        </label>
      </div>
    </div>
    <button
      type="button"
      class="material flex h-12 w-12 items-center justify-center rounded-full text-label shadow-flutuante ring-1 ring-separator transition hover:scale-105"
      aria-label="Aparência"
      title="Aparência: modo e cores"
      :aria-expanded="aberto"
      @click="aberto = !aberto"
    >
      <SwatchIcon v-if="modo === 'colorido'" class="h-6 w-6 text-accent" />
      <SunIcon v-else-if="modo === 'escuro'" class="h-6 w-6 text-warning" />
      <MoonIcon v-else class="h-6 w-6" />
    </button>
  </div>
</template>
