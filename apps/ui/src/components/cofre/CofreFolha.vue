<script setup lang="ts">
import { ref, watch } from 'vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiSheet from '@/components/ui/UiSheet.vue';
import UiTextField from '@/components/ui/UiTextField.vue';
import { APARENCIA_PADRAO, CORES_DO_COFRE, ICONES_DO_COFRE, estiloDoCofre, iconeDoCofre, type AparenciaCofre } from '@/features/cofre/aparencia';

/**
 * Folha de criar ou editar um cofre (20/11/2026): nome, cor e ícone, como no
 * Proton Pass. `cofre` nulo = fechada; sem `id` = cofre novo.
 */
const props = defineProps<{
  cofre: { id?: string; nome: string; icone?: string; cor?: string } | null;
  ocupado?: boolean;
}>();

const emit = defineEmits<{
  fechar: [];
  salvar: [dados: { nome: string } & AparenciaCofre];
}>();

const nome = ref('');
const icone = ref(APARENCIA_PADRAO.icone);
const cor = ref(APARENCIA_PADRAO.cor);

watch(
  () => props.cofre,
  (c) => {
    if (!c) return;
    nome.value = c.nome;
    icone.value = c.icone ?? APARENCIA_PADRAO.icone;
    cor.value = c.cor ?? APARENCIA_PADRAO.cor;
  },
  { immediate: true },
);

function salvar() {
  if (!nome.value.trim()) return;
  emit('salvar', { nome: nome.value.trim(), icone: icone.value, cor: cor.value });
}
</script>

<template>
  <UiSheet :aberto="!!cofre" :titulo="cofre?.id ? 'Editar cofre' : 'Novo cofre'" largura="sm" :bloqueado="ocupado" @fechar="emit('fechar')">
    <form id="form-cofre" class="space-y-4" @submit.prevent="salvar">
      <div class="flex items-center gap-3">
        <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" :style="estiloDoCofre(cor)" aria-hidden="true">
          <component :is="iconeDoCofre(icone)" class="h-6 w-6" />
        </span>
        <UiTextField v-model="nome" rotulo="Nome" placeholder="Ex.: Servidores, Bancos, Sul" maxlength="60" required />
      </div>

      <fieldset>
        <legend class="mb-1.5 px-1 text-footnote font-medium text-label-2">Cor</legend>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="c in CORES_DO_COFRE"
            :key="c.id"
            type="button"
            class="flex h-toque w-toque items-center justify-center rounded-full"
            :aria-label="c.nome"
            :aria-pressed="c.id === cor"
            :title="c.nome"
            @click="cor = c.id"
          >
            <span
              class="h-7 w-7 rounded-full ring-offset-2 ring-offset-surface"
              :class="c.id === cor ? 'ring-2 ring-label' : ''"
              :style="{ backgroundColor: c.hex }"
            />
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend class="mb-1.5 px-1 text-footnote font-medium text-label-2">Ícone</legend>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="i in ICONES_DO_COFRE"
            :key="i.id"
            type="button"
            class="flex h-toque w-toque items-center justify-center rounded-full"
            :class="i.id === icone ? '' : 'text-label-2 hover:bg-fill-2'"
            :style="i.id === icone ? estiloDoCofre(cor) : undefined"
            :aria-label="i.nome"
            :aria-pressed="i.id === icone"
            :title="i.nome"
            @click="icone = i.id"
          >
            <component :is="i.icone" class="h-5 w-5" />
          </button>
        </div>
      </fieldset>
    </form>
    <template #acoes>
      <UiButton variante="gray" @click="emit('fechar')">Cancelar</UiButton>
      <UiButton type="submit" form="form-cofre" :carregando="ocupado" :disabled="!nome.trim()">Salvar</UiButton>
    </template>
  </UiSheet>
</template>
