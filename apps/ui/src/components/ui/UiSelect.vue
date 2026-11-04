<script setup lang="ts">
import { useId } from 'vue';
import { ChevronUpDownIcon } from '@heroicons/vue/20/solid';

/**
 * Menu de escolha (select nativo) com a mesma caixa do UiTextField. Nativo de
 * propósito: no iPhone abre a roda do sistema, no desktop a lista do sistema —
 * nenhum menu feito à mão é tão acessível. As opções vêm em `opcoes` ou, para
 * quem precisa de <option> condicional, direto no slot.
 */
defineOptions({ inheritAttrs: false });
defineProps<{
  rotulo?: string;
  dica?: string;
  erro?: string | null;
  disabled?: boolean;
  opcoes?: { valor: string; rotulo: string }[];
}>();
const modelo = defineModel<string>({ default: '' });
const id = useId();
</script>

<template>
  <div class="w-full">
    <label v-if="rotulo" :for="id" class="mb-1.5 block px-1 text-footnote font-medium text-label-2">{{ rotulo }}</label>
    <div class="relative">
      <select
        :id="id"
        v-model="modelo"
        v-bind="$attrs"
        :disabled="disabled"
        :aria-invalid="erro ? true : undefined"
        :aria-describedby="erro || dica ? `${id}-nota` : undefined"
        class="block min-h-toque w-full appearance-none rounded-controle border-0 bg-fill-2 py-2.5 pl-4 pr-10 text-body text-label outline-none focus:bg-surface focus:ring-2 focus:ring-accent disabled:opacity-50"
        :class="erro ? 'ring-1 ring-danger/70' : ''"
      >
        <slot>
          <option v-for="o in opcoes" :key="o.valor" :value="o.valor">{{ o.rotulo }}</option>
        </slot>
      </select>
      <ChevronUpDownIcon class="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-label-2" aria-hidden="true" />
    </div>
    <p v-if="erro || dica" :id="`${id}-nota`" class="mt-1.5 px-1 text-footnote" :class="erro ? 'text-danger' : 'text-label-2'">
      {{ erro || dica }}
    </p>
  </div>
</template>
