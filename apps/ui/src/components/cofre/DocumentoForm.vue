<script setup lang="ts">
import { computed, ref } from 'vue';
import { DocumentIcon, ExclamationTriangleIcon, ShieldCheckIcon, TrashIcon, ArrowUpTrayIcon } from '@heroicons/vue/24/outline';
import UiTextField from '@/components/ui/UiTextField.vue';
import UiButton from '@/components/ui/UiButton.vue';
import type { ItemCofre } from '@/features/cofre/useCofre';
import { ErroAnexo, prepararAnexo, type AnexoPendente } from '@/features/cofre/anexos';
import {
  cpfValido,
  documentoVazio,
  formatarCpf,
  MAX_ANEXO_MB,
  MAX_ANEXOS_POR_ITEM,
  MIMES_ANEXO,
  nomeDoTipoDocumento,
  TIPOS_DOCUMENTO,
  type DadosDocumento,
  type TipoDocumento,
} from '@/features/cofre/tipos';

/**
 * Formulário do documento (28/11/2026): CNH, RG, CPF, passaporte e outros. Os arquivos são cifrados no navegador assim que
 * a pessoa escolhe (a chave sai daqui já dentro do `AnexoRef`); só sobem para o servidor quando ela toca em Salvar.
 */
const form = defineModel<ItemCofre>('form', { required: true });
const pendentes = defineModel<AnexoPendente[]>('pendentes', { required: true });
const props = defineProps<{ itemId: string }>();

const d = computed<DadosDocumento>(() => form.value.documento ?? documentoVazio());
const preparando = ref(false);
const erroArquivo = ref<string | null>(null);
const entrada = ref<HTMLInputElement | null>(null);

const total = computed(() => d.value.anexos.length + pendentes.value.length);
const NUMERO_ROTULO: Record<TipoDocumento, string> = { cnh: 'Número do registro', rg: 'Número do RG', cpf: 'CPF', passaporte: 'Número do passaporte', outro: 'Número (opcional)' };

function mudar(patch: Partial<DadosDocumento>) {
  form.value = { ...form.value, documento: { ...d.value, ...patch } };
}
function trocarTipo(tipo: TipoDocumento) {
  // O título acompanha o tipo enquanto a pessoa não escreveu o dela.
  const tituloPadrao = !form.value.titulo.trim() || TIPOS_DOCUMENTO.some((t) => t.rotulo === form.value.titulo);
  form.value = { ...form.value, ...(tituloPadrao ? { titulo: tipo === 'outro' ? '' : nomeDoTipoDocumento(tipo) } : {}), documento: { ...d.value, tipo } };
}
const erroCpf = computed(() => (d.value.tipo === 'cpf' && d.value.numero.replace(/\D/g, '').length === 11 && !cpfValido(d.value.numero) ? 'CPF inválido: confira os dígitos.' : null));

async function escolherArquivos(e: Event) {
  const alvo = e.target as HTMLInputElement;
  const arquivos = Array.from(alvo.files ?? []);
  alvo.value = '';
  erroArquivo.value = null;
  if (!arquivos.length) return;
  preparando.value = true;
  try {
    for (const a of arquivos) {
      if (total.value >= MAX_ANEXOS_POR_ITEM) {
        erroArquivo.value = `Um documento aceita até ${MAX_ANEXOS_POR_ITEM} arquivos.`;
        break;
      }
      pendentes.value = [...pendentes.value, await prepararAnexo(a, props.itemId)];
    }
  } catch (err) {
    erroArquivo.value = err instanceof ErroAnexo ? err.message : 'Não consegui preparar o arquivo.';
  } finally {
    preparando.value = false;
  }
}
const tirarGuardado = (id: string) => mudar({ anexos: d.value.anexos.filter((a) => a.id !== id) });
const tirarPendente = (id: string) => (pendentes.value = pendentes.value.filter((p) => p.ref.id !== id));
const tamanho = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
</script>

<template>
  <div class="space-y-3">
    <div>
      <p class="mb-1.5 px-1 text-footnote font-medium text-label-2">Tipo</p>
      <div class="flex flex-wrap gap-2" role="group" aria-label="Tipo de documento">
        <button
          v-for="t in TIPOS_DOCUMENTO"
          :key="t.id"
          type="button"
          :aria-pressed="d.tipo === t.id"
          class="rounded-full px-3.5 py-1.5 text-subhead"
          :class="d.tipo === t.id ? 'bg-accent text-white' : 'bg-fill-2 text-label'"
          @click="trocarTipo(t.id)"
        >
          {{ t.rotulo }}
        </button>
      </div>
    </div>

    <UiTextField :model-value="d.nome" rotulo="Nome no documento" autocomplete="off" @update:model-value="(v: string) => mudar({ nome: v.toUpperCase() })" />
    <UiTextField
      :model-value="d.tipo === 'cpf' ? formatarCpf(d.numero) : d.numero"
      :rotulo="NUMERO_ROTULO[d.tipo]"
      autocomplete="off"
      spellcheck="false"
      :inputmode="d.tipo === 'cpf' ? 'numeric' : 'text'"
      :maxlength="d.tipo === 'cpf' ? 14 : 30"
      :placeholder="d.tipo === 'cpf' ? '000.000.000-00' : ''"
      :erro="erroCpf"
      :dica="d.tipo === 'cpf' && cpfValido(d.numero) ? 'CPF válido' : undefined"
      @update:model-value="(v: string) => mudar({ numero: d.tipo === 'cpf' ? v.replace(/\D/g, '') : v })"
    />
    <div v-if="d.tipo === 'cnh'" class="grid grid-cols-2 gap-3">
      <UiTextField :model-value="d.categoria ?? ''" rotulo="Categoria" autocomplete="off" placeholder="AB" maxlength="5" @update:model-value="(v: string) => mudar({ categoria: v.toUpperCase() })" />
      <UiTextField :model-value="d.emissao ?? ''" rotulo="1ª habilitação" type="date" @update:model-value="(v: string) => mudar({ emissao: v })" />
    </div>
    <UiTextField v-if="d.tipo === 'rg'" :model-value="d.orgao ?? ''" rotulo="Órgão emissor / UF" autocomplete="off" placeholder="SSP/SP" @update:model-value="(v: string) => mudar({ orgao: v })" />
    <div v-if="d.tipo === 'rg' || d.tipo === 'cpf' || d.tipo === 'passaporte'" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <UiTextField :model-value="d.nascimento ?? ''" rotulo="Nascimento" type="date" @update:model-value="(v: string) => mudar({ nascimento: v })" />
    </div>
    <UiTextField v-if="d.tipo === 'cnh' || d.tipo === 'passaporte' || d.tipo === 'outro'" :model-value="d.validade ?? ''" rotulo="Validade" type="date" dica="O cofre mostra o aviso de vencimento neste aparelho." @update:model-value="(v: string) => mudar({ validade: v })" />

    <div class="space-y-2">
      <p class="px-1 text-footnote font-medium text-label-2">Arquivos <span class="text-label-3">· foto ou PDF, até {{ MAX_ANEXO_MB }} MB cada</span></p>
      <ul v-if="total" class="space-y-1.5">
        <li v-for="a in d.anexos" :key="a.id" class="flex items-center gap-2 rounded-controle bg-fill-2 px-3 py-2">
          <DocumentIcon class="h-5 w-5 shrink-0 text-label-2" aria-hidden="true" />
          <span class="min-w-0 flex-1"><span class="block truncate text-body">{{ a.nome }}</span><span class="block text-caption-1 text-label-2">Cifrado · {{ tamanho(a.tamanho) }}</span></span>
          <UiButton variante="plain" icone class="!text-danger" :aria-label="`Remover ${a.nome}`" @click="tirarGuardado(a.id)"><TrashIcon class="h-5 w-5" /></UiButton>
        </li>
        <li v-for="p in pendentes" :key="p.ref.id" class="flex items-center gap-2 rounded-controle bg-fill-2 px-3 py-2">
          <DocumentIcon class="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          <span class="min-w-0 flex-1"><span class="block truncate text-body">{{ p.ref.nome }}</span><span class="block text-caption-1 text-label-2">Novo · cifrado neste aparelho · {{ tamanho(p.ref.tamanho) }}</span></span>
          <UiButton variante="plain" icone class="!text-danger" :aria-label="`Remover ${p.ref.nome}`" @click="tirarPendente(p.ref.id)"><TrashIcon class="h-5 w-5" /></UiButton>
        </li>
      </ul>
      <input ref="entrada" type="file" class="sr-only" :accept="MIMES_ANEXO.join(',')" multiple @change="escolherArquivos" />
      <UiButton variante="gray" bloco :carregando="preparando" :disabled="total >= MAX_ANEXOS_POR_ITEM" @click="entrada?.click()"><ArrowUpTrayIcon class="h-5 w-5" />Anexar foto ou PDF</UiButton>
      <p v-if="erroArquivo" class="flex items-start gap-2 text-footnote text-danger" role="alert"><ExclamationTriangleIcon class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{{ erroArquivo }}</p>
      <p class="flex items-start gap-2 text-footnote text-label-2"><ShieldCheckIcon class="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />Cada arquivo é cifrado aqui, com uma chave só dele, antes de subir. As fotos perdem a localização e os metadados (EXIF).</p>
    </div>

    <label class="block text-footnote text-label-2">
      Notas
      <textarea :value="form.notas" rows="3" class="mt-1 w-full rounded-lg bg-fill-2 p-3 text-body text-label outline-none focus:ring-2 focus:ring-accent/40" @input="form = { ...form, notas: ($event.target as HTMLTextAreaElement).value }" />
    </label>
  </div>
</template>
