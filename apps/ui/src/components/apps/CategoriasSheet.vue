<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import axios from 'axios';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, PencilIcon, PlusIcon, TagIcon, TrashIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { categoriaApi } from '@loginhub/api-client';
import type { Categoria, DirecaoMovimento } from '@loginhub/schema';
import UiSheet from '@/components/ui/UiSheet.vue';
import UiAlert from '@/components/ui/UiAlert.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiTextField from '@/components/ui/UiTextField.vue';
import UiEmpty from '@/components/ui/UiEmpty.vue';

/**
 * Gestão dos grupos de apps do painel: criar, renomear, subir/descer e apagar.
 *
 * Apagar uma categoria NÃO apaga app: eles voltam para "Sem categoria". O
 * `total_apps` que vem da API é o que avisa quantos vão voltar.
 */
const props = defineProps<{ aberto: boolean }>();
const emit = defineEmits<{
  fechar: [];
  /** Disparado a cada mudança (criar, renomear, mover, apagar) para o painel recarregar. */
  mudou: [];
}>();

const categorias = ref<Categoria[]>([]);
const novoNome = ref('');
const editando = ref<{ id: number; nome: string } | null>(null);
const paraApagar = ref<Categoria | null>(null);
const ocupado = ref(false);
const erro = ref<string | null>(null);
const campoEdicao = ref<HTMLInputElement[] | null>(null);

async function carregar() {
  try {
    categorias.value = await categoriaApi.getAll();
  } catch (e) {
    console.error(e);
    erro.value = 'Não foi possível carregar as categorias.';
  }
}

watch(
  () => props.aberto,
  (aberto) => {
    if (!aberto) return;
    erro.value = null;
    editando.value = null;
    novoNome.value = '';
    void carregar();
  },
  { immediate: true },
);

const mensagemDe = (e: unknown, padrao: string) =>
  axios.isAxiosError(e) && e.response?.data?.message ? String(e.response.data.message) : padrao;

async function executar(acao: () => Promise<unknown>, padrao: string) {
  ocupado.value = true;
  erro.value = null;
  try {
    await acao();
    await carregar();
    emit('mudou');
  } catch (e) {
    console.error(e);
    erro.value = mensagemDe(e, padrao);
  } finally {
    ocupado.value = false;
  }
}

function criar() {
  const nome = novoNome.value.trim();
  if (!nome) return;
  void executar(async () => {
    await categoriaApi.create({ nome });
    novoNome.value = '';
  }, 'Não foi possível criar a categoria.');
}

async function comecarEdicao(c: Categoria) {
  editando.value = { id: c.id, nome: c.nome };
  await nextTick();
  campoEdicao.value?.[0]?.focus();
}

function salvarNome() {
  const alvo = editando.value;
  if (!alvo) return;
  const nome = alvo.nome.trim();
  if (!nome) return;
  void executar(async () => {
    await categoriaApi.update(alvo.id, { nome });
    editando.value = null;
  }, 'Não foi possível renomear a categoria.');
}

const mover = (id: number, direcao: DirecaoMovimento) =>
  executar(() => categoriaApi.mover(id, direcao), 'Não foi possível mover a categoria.');

function confirmarApagar() {
  const alvo = paraApagar.value;
  if (!alvo) return;
  void executar(async () => {
    await categoriaApi.delete(alvo.id);
    paraApagar.value = null;
  }, 'Não foi possível apagar a categoria.');
}

const mensagemApagar = computed(() => {
  const c = paraApagar.value;
  if (c && (c.total_apps ?? 0) > 0) {
    const quantos = c.total_apps === 1 ? '1 aplicativo vai voltar' : `${c.total_apps} aplicativos vão voltar`;
    return `${quantos} para "Sem categoria". Nenhum aplicativo será apagado.`;
  }
  return 'A categoria está vazia. Nenhum aplicativo será afetado.';
});

const seta =
  'flex h-toque w-9 items-center justify-center rounded-lg text-label-2 hover:bg-accent/10 hover:text-accent disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-label-2';
const acao = 'flex h-toque w-toque items-center justify-center rounded-full disabled:opacity-40';
</script>

<template>
  <UiSheet :aberto="aberto" titulo="Categorias" subtitulo="Grupos de aplicativos do painel" largura="md" @fechar="emit('fechar')">
    <div class="space-y-4">
      <p v-if="erro" role="alert" class="rounded-celula bg-danger/10 p-3 text-subhead text-danger">{{ erro }}</p>

      <form class="flex items-start gap-2" @submit.prevent="criar">
        <UiTextField v-model="novoNome" rotulo="Nova categoria" rotulo-oculto placeholder="Nova categoria (ex.: Financeiro)" maxlength="100" />
        <UiButton type="submit" :disabled="ocupado || !novoNome.trim()">
          <PlusIcon class="h-5 w-5" />
          Criar
        </UiButton>
      </form>

      <div class="overflow-hidden rounded-celula bg-fill-2">
        <UiEmpty
          v-if="categorias.length === 0"
          :icone="TagIcon"
          titulo="Nenhuma categoria ainda"
          texto="Crie a primeira acima — os apps ficam em “Sem categoria” até serem agrupados."
        />
        <ul v-else class="divide-y">
          <li v-for="(c, i) in categorias" :key="c.id" class="flex items-center gap-1 py-1 pl-1 pr-2">
            <div class="flex">
              <button type="button" :class="seta" :disabled="ocupado || i === 0" aria-label="Subir" title="Subir" @click="mover(c.id, 'cima')">
                <ChevronUpIcon class="h-5 w-5" />
              </button>
              <button
                type="button"
                :class="seta"
                :disabled="ocupado || i === categorias.length - 1"
                aria-label="Descer"
                title="Descer"
                @click="mover(c.id, 'baixo')"
              >
                <ChevronDownIcon class="h-5 w-5" />
              </button>
            </div>

            <input
              v-if="editando?.id === c.id"
              ref="campoEdicao"
              v-model="editando.nome"
              type="text"
              maxlength="100"
              aria-label="Nome da categoria"
              class="min-h-[40px] min-w-0 flex-1 rounded-lg border-0 bg-surface px-3 text-body text-label outline-none ring-2 ring-accent"
              @keydown.enter.prevent="salvarNome"
              @keydown.esc.stop="editando = null"
            />
            <div v-else class="min-w-0 flex-1 px-1">
              <p class="truncate text-body">{{ c.nome }}</p>
              <p class="text-footnote text-label-2">{{ c.total_apps === 1 ? '1 aplicativo' : `${c.total_apps ?? 0} aplicativos` }}</p>
            </div>

            <template v-if="editando?.id === c.id">
              <button type="button" :class="[acao, 'text-accent hover:bg-accent/10']" :disabled="ocupado" aria-label="Salvar" @click="salvarNome">
                <CheckIcon class="h-5 w-5" />
              </button>
              <button type="button" :class="[acao, 'text-label-2 hover:bg-fill']" aria-label="Cancelar" @click="editando = null">
                <XMarkIcon class="h-5 w-5" />
              </button>
            </template>
            <template v-else>
              <button
                type="button"
                :class="[acao, 'text-label-2 hover:bg-accent/10 hover:text-accent']"
                :disabled="ocupado"
                :aria-label="`Renomear ${c.nome}`"
                title="Renomear"
                @click="comecarEdicao(c)"
              >
                <PencilIcon class="h-5 w-5" />
              </button>
              <button
                type="button"
                :class="[acao, 'text-label-2 hover:bg-danger/10 hover:text-danger']"
                :disabled="ocupado"
                :aria-label="`Apagar ${c.nome}`"
                title="Apagar categoria"
                @click="paraApagar = c"
              >
                <TrashIcon class="h-5 w-5" />
              </button>
            </template>
          </li>
        </ul>
      </div>

      <p class="px-1 text-footnote text-label-2">
        A ordem daqui é a ordem dos grupos no painel. Apagar uma categoria não apaga aplicativo: eles voltam para “Sem
        categoria”.
      </p>
    </div>

    <template #acoes>
      <UiButton variante="gray" @click="emit('fechar')">Fechar</UiButton>
    </template>
  </UiSheet>

  <UiAlert
    :aberto="!!paraApagar"
    tom="danger"
    :icone="TrashIcon"
    titulo="Apagar categoria"
    :destaque="paraApagar?.nome"
    :mensagem="mensagemApagar"
    confirmar="Apagar"
    :carregando="ocupado"
    texto-carregando="Apagando…"
    @fechar="paraApagar = null"
    @confirmar="confirmarApagar"
  />
</template>
