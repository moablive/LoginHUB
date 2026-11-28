<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { ArrowDownTrayIcon, ClipboardDocumentIcon, DocumentIcon, ExclamationTriangleIcon, EyeIcon, EyeSlashIcon, LockClosedIcon, ShieldCheckIcon } from '@heroicons/vue/24/outline';
import UiButton from '@/components/ui/UiButton.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiSheet from '@/components/ui/UiSheet.vue';
import UiSpinner from '@/components/ui/UiSpinner.vue';
import type { ItemAberto } from '@/features/cofre/useCofre';
import { abrirAnexo, ErroAnexo, urlTemporaria } from '@/features/cofre/anexos';
import { alternarRevelado, copiarSensivel, estaRevelado, exigirPresenca, protegerRevelacao, segundosParaEsconder, REVELADO_MS } from '@/features/cofre/revelar';
import {
  agruparNumero,
  brData,
  cartaoVencido,
  finalDe,
  mascaraCartao,
  mascaraDocumento,
  nomeDoTipoDocumento,
  numeroDocumentoFormatado,
  situacaoDaValidade,
  type AnexoRef,
} from '@/features/cofre/tipos';

/**
 * Corpo do detalhe de um cartão ou documento (28/11/2026): o cartão desenhado, os campos mascarados com Mostrar e Copiar
 * (pedem a digital ou a palavra-passe de novo, ver revelar.ts) e os arquivos cifrados. O cabeçalho, as notas e os campos
 * extras continuam sendo da tela do cofre.
 */
const props = defineProps<{ item: ItemAberto }>();
protegerRevelacao();

const chave = (campo: string): string => `${props.item.id}:${campo}`;
const copiado = ref<string | null>(null);
const erro = ref<string | null>(null);
let apagaAviso: ReturnType<typeof setTimeout> | undefined;

async function revelar(campo: string) {
  erro.value = null;
  await alternarRevelado(chave(campo));
}
async function copiar(campo: string, valor: string) {
  erro.value = null;
  try {
    if (await copiarSensivel(valor)) {
      copiado.value = campo;
      clearTimeout(apagaAviso);
      apagaAviso = setTimeout(() => (copiado.value = null), 3000);
    }
  } catch {
    erro.value = 'O navegador não deixou copiar.';
  }
}

const cartao = computed(() => props.item.cartao);
const doc = computed(() => props.item.documento);
const validade = computed(() => situacaoDaValidade(doc.value?.validade));
const numeroAberto = computed(() => estaRevelado(chave('numero')));

// --- arquivos
const abrindo = ref<string | null>(null);
const visto = ref<{ ref: AnexoRef; url: string } | null>(null);
let fechaVisto: ReturnType<typeof setTimeout> | undefined;
const VISTO_MS = 60_000;

function fecharVisto() {
  clearTimeout(fechaVisto);
  if (visto.value) URL.revokeObjectURL(visto.value.url);
  visto.value = null;
}
async function verArquivo(a: AnexoRef) {
  erro.value = null;
  if (!(await exigirPresenca())) return;
  abrindo.value = a.id;
  try {
    const bytes = await abrirAnexo(a, props.item.id);
    fecharVisto();
    visto.value = { ref: a, url: urlTemporaria(bytes, a.mime) };
    bytes.fill(0);
    // O arquivo em claro não fica aberto para sempre: fecha e revoga em 60 s.
    fechaVisto = setTimeout(fecharVisto, VISTO_MS);
  } catch (e) {
    erro.value = e instanceof ErroAnexo ? e.message : 'Não consegui abrir o arquivo. Confira a conexão e tente de novo.';
  } finally {
    abrindo.value = null;
  }
}
function salvarCopia() {
  const v = visto.value;
  if (!v) return;
  const link = document.createElement('a');
  link.href = v.url;
  link.download = v.ref.nome;
  link.click();
}
onBeforeUnmount(fecharVisto);
const tamanho = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
</script>

<template>
  <div class="space-y-3">
    <!-- CARTÃO -->
    <template v-if="item.tipo === 'cartao' && cartao">
      <div class="flex aspect-[1.586] max-w-sm flex-col justify-between rounded-2xl bg-gradient-to-br from-indigo to-accent p-5 text-white shadow-lg" aria-hidden="true">
        <div class="flex items-center justify-between text-subhead font-bold"><span class="truncate">{{ cartao.banco }}</span><span>{{ cartao.bandeira }}</span></div>
        <div class="h-7 w-9 rounded bg-gradient-to-br from-yellow-200 to-yellow-600" />
        <div class="font-mono text-title-3 font-semibold tracking-wider">{{ numeroAberto ? agruparNumero(cartao.numero) : mascaraCartao(cartao.numero) }}</div>
        <div class="flex justify-between gap-2 text-footnote"><span class="truncate">{{ cartao.titular }}</span><span>{{ cartao.validade }}</span></div>
      </div>
      <div class="divide-y divide-separator overflow-hidden rounded-celula bg-surface">
        <div class="flex items-center gap-3 px-4 py-3">
          <div class="min-w-0 flex-1">
            <p class="text-footnote text-label-2">Número</p>
            <p class="truncate font-mono text-body">{{ numeroAberto ? agruparNumero(cartao.numero) : mascaraCartao(cartao.numero) }}</p>
            <div v-if="numeroAberto" class="mt-1 h-0.5 overflow-hidden rounded bg-fill-2" aria-hidden="true"><div class="h-full bg-accent transition-[width] duration-1000 ease-linear" :style="{ width: `${(segundosParaEsconder(chave('numero')) / (REVELADO_MS / 1000)) * 100}%` }" /></div>
          </div>
          <span v-if="copiado === 'numero'" class="text-caption-1 text-success">copiado · limpa em 30 s</span>
          <button type="button" class="text-label-2" :aria-label="numeroAberto ? 'Esconder o número' : 'Mostrar o número'" @click="revelar('numero')"><EyeSlashIcon v-if="numeroAberto" class="h-5 w-5" /><EyeIcon v-else class="h-5 w-5" /></button>
          <button type="button" class="text-accent" aria-label="Copiar o número do cartão" @click="copiar('numero', cartao.numero)"><ClipboardDocumentIcon class="h-5 w-5" /></button>
        </div>
        <div class="px-4 py-3"><p class="text-footnote text-label-2">Titular</p><p class="text-body">{{ cartao.titular || '—' }}</p></div>
        <div class="flex items-center justify-between gap-2 px-4 py-3">
          <div><p class="text-footnote text-label-2">Validade</p><p class="text-body">{{ cartao.validade }}</p></div>
          <UiBadge v-if="cartaoVencido(cartao.validade)" tom="danger">vencido</UiBadge>
        </div>
        <div v-if="cartao.cvv" class="flex items-center gap-3 px-4 py-3">
          <div class="min-w-0 flex-1"><p class="text-footnote text-label-2">CVV</p><p class="font-mono text-body">{{ estaRevelado(chave('cvv')) ? cartao.cvv : '•••' }}</p></div>
          <span class="text-caption-1 text-label-3" title="O CVV nunca vai para a área de transferência">sem cópia</span>
          <button type="button" class="text-label-2" :aria-label="estaRevelado(chave('cvv')) ? 'Esconder o CVV' : 'Mostrar o CVV'" @click="revelar('cvv')"><EyeSlashIcon v-if="estaRevelado(chave('cvv'))" class="h-5 w-5" /><EyeIcon v-else class="h-5 w-5" /></button>
        </div>
        <div v-if="cartao.pin" class="flex items-center gap-3 px-4 py-3">
          <div class="min-w-0 flex-1"><p class="text-footnote text-label-2">PIN</p><p class="font-mono text-body">{{ estaRevelado(chave('pin')) ? cartao.pin : '••••' }}</p></div>
          <span class="text-caption-1 text-label-3">sem cópia</span>
          <button type="button" class="text-label-2" :aria-label="estaRevelado(chave('pin')) ? 'Esconder o PIN' : 'Mostrar o PIN'" @click="revelar('pin')"><EyeSlashIcon v-if="estaRevelado(chave('pin'))" class="h-5 w-5" /><EyeIcon v-else class="h-5 w-5" /></button>
        </div>
        <div v-else-if="!cartao.cvv" class="px-4 py-3"><p class="text-footnote text-label-2">CVV e PIN</p><p class="text-body text-label-3">Não salvos (padrão)</p></div>
      </div>
      <p class="sr-only">Final {{ finalDe(cartao.numero) }}</p>
    </template>

    <!-- DOCUMENTO -->
    <template v-else-if="item.tipo === 'documento' && doc">
      <div class="divide-y divide-separator overflow-hidden rounded-celula bg-surface">
        <div class="flex items-center gap-3 px-4 py-3">
          <div class="min-w-0 flex-1">
            <p class="text-footnote text-label-2">{{ doc.tipo === 'cpf' ? 'CPF' : doc.tipo === 'outro' ? 'Número' : `Número do ${nomeDoTipoDocumento(doc.tipo)}` }}</p>
            <p class="truncate font-mono text-body">{{ numeroAberto ? numeroDocumentoFormatado(doc.tipo, doc.numero) : mascaraDocumento(doc.tipo, doc.numero) }}</p>
            <div v-if="numeroAberto" class="mt-1 h-0.5 overflow-hidden rounded bg-fill-2" aria-hidden="true"><div class="h-full bg-accent transition-[width] duration-1000 ease-linear" :style="{ width: `${(segundosParaEsconder(chave('numero')) / (REVELADO_MS / 1000)) * 100}%` }" /></div>
          </div>
          <template v-if="doc.numero">
            <span v-if="copiado === 'numero'" class="text-caption-1 text-success">copiado · limpa em 30 s</span>
            <button type="button" class="text-label-2" :aria-label="numeroAberto ? 'Esconder o número' : 'Mostrar o número'" @click="revelar('numero')"><EyeSlashIcon v-if="numeroAberto" class="h-5 w-5" /><EyeIcon v-else class="h-5 w-5" /></button>
            <button type="button" class="text-accent" aria-label="Copiar o número do documento" @click="copiar('numero', numeroDocumentoFormatado(doc.tipo, doc.numero))"><ClipboardDocumentIcon class="h-5 w-5" /></button>
          </template>
        </div>
        <div v-if="doc.nome" class="px-4 py-3"><p class="text-footnote text-label-2">Nome</p><p class="text-body">{{ doc.nome }}</p></div>
        <div v-if="doc.categoria" class="px-4 py-3"><p class="text-footnote text-label-2">Categoria</p><p class="text-body">{{ doc.categoria }}</p></div>
        <div v-if="doc.orgao" class="px-4 py-3"><p class="text-footnote text-label-2">Órgão emissor</p><p class="text-body">{{ doc.orgao }}</p></div>
        <div v-if="doc.emissao" class="px-4 py-3"><p class="text-footnote text-label-2">1ª habilitação</p><p class="text-body">{{ brData(doc.emissao) }}</p></div>
        <div v-if="doc.nascimento" class="px-4 py-3"><p class="text-footnote text-label-2">Nascimento</p><p class="text-body">{{ brData(doc.nascimento) }}</p></div>
        <div v-if="doc.validade" class="flex items-center justify-between gap-2 px-4 py-3">
          <div><p class="text-footnote text-label-2">Validade</p><p class="text-body">{{ brData(doc.validade) }}</p></div>
          <UiBadge v-if="validade" :tom="validade === 'vencido' ? 'danger' : validade === 'vence-logo' ? 'warning' : 'success'">{{ validade === 'vencido' ? 'vencido' : validade === 'vence-logo' ? 'vence em até 90 dias' : 'em dia' }}</UiBadge>
        </div>
      </div>

      <div v-if="doc.anexos.length" class="space-y-2">
        <p class="px-1 text-footnote font-medium text-label-2">Arquivos cifrados ({{ doc.anexos.length }})</p>
        <ul class="space-y-1.5">
          <li v-for="a in doc.anexos" :key="a.id" class="flex items-center gap-3 rounded-celula bg-surface px-4 py-3">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-fill-2 text-label-2"><LockClosedIcon class="h-5 w-5" aria-hidden="true" /></span>
            <span class="min-w-0 flex-1"><span class="block truncate text-body">{{ a.nome }}</span><span class="block text-caption-1 text-label-2">{{ a.mime === 'application/pdf' ? 'PDF' : 'Foto' }} · {{ tamanho(a.tamanho) }}</span></span>
            <UiButton variante="tinted" tamanho="small" :carregando="abrindo === a.id" :aria-label="`Visualizar ${a.nome}`" @click="verArquivo(a)"><EyeIcon class="h-4 w-4" />Visualizar</UiButton>
          </li>
        </ul>
      </div>
      <p v-else class="flex items-start gap-2 rounded-celula bg-surface px-4 py-3 text-footnote text-label-2"><ExclamationTriangleIcon class="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />Sem arquivo anexado. Use Editar para anexar a foto ou o PDF.</p>
    </template>

    <p v-if="erro" class="rounded-controle bg-danger/10 px-3 py-2 text-footnote text-danger" role="alert">{{ erro }}</p>
    <p class="flex items-start gap-2 text-footnote text-label-2">
      <ShieldCheckIcon class="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
      Cifrado neste aparelho antes de sair. Mostrar e Copiar pedem a digital ou a palavra-passe de novo; o valor se esconde em 20 s e o que você copia some da área de transferência em 30 s.
    </p>

    <UiSheet :aberto="!!visto" :titulo="visto?.ref.nome ?? ''" subtitulo="Fecha sozinho em 1 minuto" largura="lg" @fechar="fecharVisto">
      <div v-if="visto" class="flex min-h-48 items-center justify-center">
        <img v-if="visto.ref.mime !== 'application/pdf'" :src="visto.url" :alt="visto.ref.nome" draggable="false" class="max-h-[70dvh] max-w-full rounded-controle" />
        <iframe v-else :src="visto.url" :title="visto.ref.nome" class="h-[70dvh] w-full rounded-controle bg-white" />
      </div>
      <UiSpinner v-else />
      <template #acoes>
        <UiButton variante="gray" @click="salvarCopia"><ArrowDownTrayIcon class="h-5 w-5" />Salvar cópia</UiButton>
        <UiButton @click="fecharVisto"><DocumentIcon class="h-5 w-5" />Fechar</UiButton>
      </template>
    </UiSheet>
  </div>
</template>
