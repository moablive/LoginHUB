<script setup lang="ts">
import { ref, watch } from 'vue';
import { PhotoIcon } from '@heroicons/vue/24/outline';
import CofreIcone from './CofreIcone.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiSheet from '@/components/ui/UiSheet.vue';
import UiTextField from '@/components/ui/UiTextField.vue';
import { APARENCIA_PADRAO, CORES_DO_COFRE, ICONES_DO_COFRE, estiloDoCofre, miniaturaDoCofre, type AparenciaCofre } from '@/features/cofre/aparencia';

/**
 * Folha de criar ou editar um cofre (20/11/2026): nome, cor e ícone, como no
 * Proton Pass. `cofre` nulo = fechada; sem `id` = cofre novo.
 *
 * 24/11/2026 (pedido do dono): no lugar do ícone dá para pôr uma IMAGEM (o logo
 * da empresa, por exemplo). O arquivo é reduzido a uma miniatura aqui no
 * navegador e vai cifrado dentro do cofre; o servidor não a vê.
 */
const props = defineProps<{
  cofre: { id?: string; nome: string; icone?: string; cor?: string; imagem?: string } | null;
  ocupado?: boolean;
}>();

const emit = defineEmits<{
  fechar: [];
  /** `imagem` nula = sem imagem (tira a que havia). */
  salvar: [dados: { nome: string; imagem: string | null } & AparenciaCofre];
}>();

const nome = ref('');
const icone = ref(APARENCIA_PADRAO.icone);
const cor = ref(APARENCIA_PADRAO.cor);
const imagem = ref<string | null>(null);
const erroDaImagem = ref<string | null>(null);
const arquivo = ref<HTMLInputElement | null>(null);

watch(
  () => props.cofre,
  (c) => {
    if (!c) return;
    nome.value = c.nome;
    icone.value = c.icone ?? APARENCIA_PADRAO.icone;
    cor.value = c.cor ?? APARENCIA_PADRAO.cor;
    imagem.value = c.imagem ?? null;
    erroDaImagem.value = null;
  },
  { immediate: true },
);

function salvar() {
  if (!nome.value.trim()) return;
  emit('salvar', { nome: nome.value.trim(), icone: icone.value, cor: cor.value, imagem: imagem.value });
}

async function escolherImagem(e: Event) {
  const campo = e.target as HTMLInputElement;
  const escolhido = campo.files?.[0];
  campo.value = '';
  if (!escolhido) return;
  erroDaImagem.value = null;
  try {
    imagem.value = await miniaturaDoCofre(escolhido);
  } catch {
    erroDaImagem.value = 'Não consegui usar este arquivo como imagem. Tente um PNG ou JPG.';
  }
}
</script>

<template>
  <UiSheet :aberto="!!cofre" :titulo="cofre?.id ? 'Editar cofre' : 'Novo cofre'" largura="sm" :bloqueado="ocupado" @fechar="emit('fechar')">
    <form id="form-cofre" class="space-y-4" @submit.prevent="salvar">
      <div class="flex items-center gap-3">
        <CofreIcone :icone="icone" :cor="cor" :imagem="imagem ?? undefined" grande />
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
        <legend class="mb-1.5 px-1 text-footnote font-medium text-label-2">Imagem (no lugar do ícone)</legend>
        <input ref="arquivo" type="file" accept="image/*" class="hidden" @change="escolherImagem" />
        <div class="flex flex-wrap gap-2">
          <UiButton variante="tinted" tamanho="small" @click="arquivo?.click()">
            <PhotoIcon class="h-4 w-4" />{{ imagem ? 'Trocar a imagem' : 'Escolher uma imagem' }}
          </UiButton>
          <UiButton v-if="imagem" variante="plain" tamanho="small" @click="imagem = null">Tirar a imagem</UiButton>
        </div>
        <p v-if="erroDaImagem" role="alert" class="mt-1.5 px-1 text-footnote text-danger">{{ erroDaImagem }}</p>
        <p v-else class="mt-1.5 px-1 text-footnote text-label-2">Vira uma miniatura redonda. Fica cifrada dentro do cofre, como o nome.</p>
      </fieldset>

      <fieldset :class="imagem ? 'opacity-50' : ''">
        <legend class="mb-1.5 px-1 text-footnote font-medium text-label-2">Ícone{{ imagem ? ' (usado se você tirar a imagem)' : '' }}</legend>
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
