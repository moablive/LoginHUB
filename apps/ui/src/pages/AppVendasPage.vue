<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import axios from 'axios';
import {
  ArrowPathIcon,
  BanknotesIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  EnvelopeIcon,
  LinkIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  UserGroupIcon,
  UsersIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';
import { appApi, vendaApi, type PainelDeVendas } from '@loginhub/api-client';
import type { Afiliado, App, Assinatura, StatusAssinatura } from '@loginhub/schema';
import UiNavBar from '@/components/ui/UiNavBar.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiSection from '@/components/ui/UiSection.vue';
import UiTextField from '@/components/ui/UiTextField.vue';
import UiSwitch from '@/components/ui/UiSwitch.vue';
import UiSegmented from '@/components/ui/UiSegmented.vue';
import UiSheet from '@/components/ui/UiSheet.vue';
import UiAlert from '@/components/ui/UiAlert.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiEmpty from '@/components/ui/UiEmpty.vue';
import UiSpinner from '@/components/ui/UiSpinner.vue';
import { masks } from '@/utils/masks';

/**
 * Venda do app por assinatura mensal (db/009_assinaturas_afiliados.sql): o
 * preço, os links de afiliado, quem assina e quanto se deve a cada afiliado.
 *
 * O dinheiro entra pelo Mercado Pago da Astral Wave, no cartão, todo mês. A
 * comissão de cada mensalidade fica gravada com a porcentagem do dia; "Pagar"
 * aqui só REGISTRA que o repasse foi feito — o Pix para o afiliado é por fora.
 */
const props = defineProps<{ id: string }>();

const app = ref<App | null>(null);
const painel = ref<PainelDeVendas | null>(null);
const carregando = ref(true);
const ocupado = ref(false);
const erro = ref<string | null>(null);
const aviso = ref<string | null>(null);
const copiado = ref<string | null>(null);

// Formulário do preço
const preco = ref('');
const comissaoPadrao = ref('');
const aVenda = ref(true);

// Afiliado em edição (id 0 = novo)
const afiliadoForm = ref<{ id: number; nome: string; email: string; chave_pix: string; codigo: string; comissao_pct: string; ativo: boolean } | null>(null);
const afiliadoParaApagar = ref<Afiliado | null>(null);
const afiliadoParaPagar = ref<Afiliado | null>(null);
const assinaturaParaCancelar = ref<Assinatura | null>(null);
const filtro = ref<'ativas' | 'todas'>('ativas');

const dinheiro = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const data = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const numeroBr = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const mensagemDe = (e: unknown, padrao: string) =>
  axios.isAxiosError(e) && e.response?.data?.message ? String(e.response.data.message) : padrao;

async function carregar() {
  try {
    const [dadosApp, dados] = await Promise.all([appApi.getById(props.id), vendaApi.painel(props.id)]);
    app.value = dadosApp;
    painel.value = dados;
    preco.value = dados.plano ? numeroBr(dados.plano.valor) : '';
    comissaoPadrao.value = dados.plano ? String(dados.plano.comissao_padrao_pct).replace('.', ',') : '5';
    aVenda.value = dados.plano?.ativo ?? true;
  } catch (e) {
    console.error(e);
    erro.value = mensagemDe(e, 'Não foi possível carregar as vendas.');
  } finally {
    carregando.value = false;
  }
}

onMounted(carregar);

async function executar(acao: () => Promise<string | void>, padrao: string) {
  ocupado.value = true;
  erro.value = null;
  aviso.value = null;
  try {
    const mensagem = await acao();
    await carregar();
    if (mensagem) aviso.value = mensagem;
  } catch (e) {
    console.error(e);
    erro.value = mensagemDe(e, padrao);
  } finally {
    ocupado.value = false;
  }
}

const base = computed(() => (app.value?.platform_url || '').replace(/\/+$/, ''));
const linkDaPagina = computed(() => (base.value ? `${base.value}/assine` : ''));

const resumo = computed(() => {
  const r = painel.value?.resumo;
  return [
    { rotulo: 'Assinantes ativos', valor: String(r?.assinantes_ativos ?? 0), icone: UsersIcon, cor: 'bg-accent/15 text-accent' },
    { rotulo: 'Receita por mês', valor: dinheiro(r?.receita_mensal ?? 0), icone: BanknotesIcon, cor: 'bg-success/15 text-success' },
    { rotulo: 'Total recebido', valor: dinheiro(r?.total_recebido ?? 0), icone: BanknotesIcon, cor: 'bg-indigo/15 text-indigo' },
    { rotulo: 'Comissão a pagar', valor: dinheiro(r?.comissao_a_pagar ?? 0), icone: UserGroupIcon, cor: 'bg-warning/15 text-warning' },
  ];
});

const assinaturasVisiveis = computed(() => {
  const lista = painel.value?.assinaturas ?? [];
  return filtro.value === 'ativas' ? lista.filter((a) => a.status === 'ativa') : lista;
});

const STATUS: Record<StatusAssinatura, { rotulo: string; tom: 'success' | 'warning' | 'danger' | 'neutro' }> = {
  ativa: { rotulo: 'Ativa', tom: 'success' },
  pausada: { rotulo: 'Pausada', tom: 'warning' },
  cancelada: { rotulo: 'Cancelada', tom: 'danger' },
  iniciada: { rotulo: 'Iniciada', tom: 'neutro' },
};

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    copiado.value = texto;
    setTimeout(() => copiado.value === texto && (copiado.value = null), 2000);
  } catch {
    erro.value = 'Não foi possível copiar. Selecione o link e copie à mão.';
  }
}

const salvarPlano = () =>
  executar(async () => {
    await vendaApi.salvarPlano(props.id, { valor: preco.value, comissao_padrao_pct: comissaoPadrao.value, ativo: aVenda.value });
    return 'Preço salvo. Vale para as próximas assinaturas; quem já assina continua com o valor atual.';
  }, 'Não foi possível salvar o preço.');

function abrirAfiliado(a?: Afiliado) {
  afiliadoForm.value = a
    ? {
        id: a.id,
        nome: a.nome,
        email: a.email ?? '',
        chave_pix: a.chave_pix ?? '',
        codigo: a.codigo,
        comissao_pct: a.comissao_pct === null ? '' : String(a.comissao_pct).replace('.', ','),
        ativo: a.ativo,
      }
    : { id: 0, nome: '', email: '', chave_pix: '', codigo: '', comissao_pct: '', ativo: true };
}

function salvarAfiliado() {
  const f = afiliadoForm.value;
  if (!f || !f.nome.trim()) return;
  const payload = { nome: f.nome, email: f.email, chave_pix: f.chave_pix, codigo: f.codigo, comissao_pct: f.comissao_pct.trim() || null, ativo: f.ativo };
  void executar(async () => {
    if (f.id) await vendaApi.atualizarAfiliado(f.id, payload);
    else await vendaApi.criarAfiliado(props.id, payload);
    afiliadoForm.value = null;
  }, 'Não foi possível salvar o afiliado.');
}

function confirmarApagarAfiliado() {
  const alvo = afiliadoParaApagar.value;
  if (!alvo) return;
  afiliadoParaApagar.value = null;
  void executar(() => vendaApi.apagarAfiliado(alvo.id), 'Não foi possível apagar o afiliado.');
}

function confirmarPagamento() {
  const alvo = afiliadoParaPagar.value;
  if (!alvo) return;
  afiliadoParaPagar.value = null;
  void executar(async () => {
    const r = await vendaApi.pagarComissoes(alvo.id);
    return `${dinheiro(r.total)} de comissão de ${alvo.nome} marcados como pagos.`;
  }, 'Não foi possível registrar o pagamento.');
}

function confirmarCancelamento() {
  const alvo = assinaturaParaCancelar.value;
  if (!alvo) return;
  assinaturaParaCancelar.value = null;
  void executar(async () => {
    await vendaApi.cancelarAssinatura(alvo.id);
    return `Assinatura de ${alvo.nome} cancelada. O Mercado Pago não cobra mais e o acesso foi desligado.`;
  }, 'Não foi possível cancelar a assinatura.');
}

const reenviar = (a: Assinatura) =>
  executar(async () => {
    const r = await vendaApi.reenviarAcesso(a.id);
    if (!r.emailSent) throw new Error('sem envio');
    return `E-mail de acesso reenviado para ${a.email}, com link de senha novo.`;
  }, 'O e-mail não saiu. Confira o SMTP do LoginHUB.');

const conferir = () =>
  executar(async () => {
    await vendaApi.conferir();
    return 'Assinaturas conferidas no Mercado Pago.';
  }, 'Não foi possível conferir no Mercado Pago.');

const acaoIcone = 'flex h-toque w-toque items-center justify-center rounded-full text-label-2 disabled:opacity-40';
</script>

<template>
  <div class="animate-fade-in">
    <UiNavBar :titulo="app?.nome || 'Vendas'" subtitulo="Vendas · assinatura mensal, afiliados e comissões" voltar="/dashboard" voltar-texto="Aplicativos">
      <template #acoes>
        <UiButton variante="plain" icone aria-label="Conferir no Mercado Pago" title="Conferir agora no Mercado Pago" :disabled="ocupado || carregando" @click="conferir">
          <ArrowPathIcon class="h-6 w-6" :class="ocupado ? 'animate-spin' : ''" />
        </UiButton>
      </template>
    </UiNavBar>

    <div v-if="carregando" class="flex justify-center py-16"><UiSpinner /></div>

    <div v-else class="mt-4 space-y-8">
      <p v-if="erro" role="alert" class="rounded-celula bg-danger/10 p-3 text-subhead text-danger">{{ erro }}</p>
      <p v-if="aviso" role="status" class="rounded-celula bg-success/10 p-3 text-subhead text-success">{{ aviso }}</p>

      <!-- RESUMO -->
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div v-for="item in resumo" :key="item.rotulo" class="rounded-celula bg-surface p-4">
          <div class="flex items-center justify-between gap-2">
            <p class="text-subhead font-medium text-label-2">{{ item.rotulo }}</p>
            <span class="flex h-8 w-8 items-center justify-center rounded-lg" :class="item.cor">
              <component :is="item.icone" class="h-5 w-5" />
            </span>
          </div>
          <p class="mt-2 text-title-2 font-semibold tabular-nums">{{ item.valor }}</p>
        </div>
      </div>

      <!-- PREÇO -->
      <UiSection
        titulo="Preço da assinatura"
        rodape="O preço novo vale para quem assinar a partir de agora. Quem já assina continua pagando o valor com que entrou."
      >
        <form class="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" @submit.prevent="salvarPlano">
          <UiTextField v-model="preco" rotulo="Mensalidade (R$)" inputmode="decimal" placeholder="49,90" required />
          <UiTextField v-model="comissaoPadrao" rotulo="Comissão padrão dos afiliados (%)" inputmode="decimal" placeholder="5" />
          <UiButton type="submit" :disabled="ocupado || !preco.trim()">Salvar</UiButton>
        </form>
        <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <UiSwitch v-model="aVenda" rotulo="À venda (a página de venda aceita novas assinaturas)" />
          <p v-if="!painel?.plano" class="text-footnote text-warning">Sem preço salvo: este aplicativo ainda não está à venda.</p>
        </div>
        <div v-if="linkDaPagina" class="mt-4 flex items-center gap-2 rounded-lg bg-fill-2 px-3 py-2">
          <LinkIcon class="h-5 w-5 shrink-0 text-label-2" />
          <a :href="linkDaPagina" target="_blank" rel="noopener" class="min-w-0 flex-1 truncate text-subhead text-accent">{{ linkDaPagina }}</a>
          <button type="button" :class="[acaoIcone, 'hover:bg-accent/10 hover:text-accent']" aria-label="Copiar link da página de venda" title="Copiar" @click="copiar(linkDaPagina)">
            <component :is="copiado === linkDaPagina ? CheckIcon : ClipboardDocumentIcon" class="h-5 w-5" />
          </button>
        </div>
      </UiSection>

      <!-- AFILIADOS -->
      <UiSection titulo="Afiliados" lista rodape="“Pagar” registra que você já repassou a comissão em aberto; o Pix ao afiliado é feito por fora.">
        <template #acao>
          <UiButton variante="plain" tamanho="small" @click="abrirAfiliado()">
            <PlusIcon class="h-4 w-4" stroke-width="2.5" />
            Novo afiliado
          </UiButton>
        </template>
        <UiEmpty
          v-if="!painel?.afiliados.length"
          :icone="UserGroupIcon"
          titulo="Nenhum afiliado ainda"
          texto="Crie um afiliado para gerar o link de divulgação dele."
        />
        <div v-for="a in painel?.afiliados" :key="a.id" class="px-4 py-3">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div class="min-w-0 flex-1">
              <p class="flex flex-wrap items-center gap-2 text-headline font-semibold">
                <span class="truncate">{{ a.nome }}</span>
                <UiBadge :tom="a.ativo ? 'success' : 'neutro'">{{ a.ativo ? 'Ativo' : 'Desativado' }}</UiBadge>
                <UiBadge v-if="a.origem === 'pagina'" tom="indigo" title="A própria pessoa se cadastrou pela página de venda">Cadastro pela página</UiBadge>
                <UiBadge tom="accent" :title="a.comissao_pct === null ? 'Comissão padrão do plano' : 'Comissão própria deste afiliado'">
                  {{ pct(a.comissao_efetiva_pct) }}{{ a.comissao_pct === null ? ' (padrão)' : '' }}
                </UiBadge>
              </p>
              <p class="truncate text-footnote text-label-2">
                {{ a.email || 'sem e-mail' }}<template v-if="a.chave_pix"> · Pix: {{ a.chave_pix }}</template>
              </p>
              <!-- Quem se cadastrou pela página de venda traz WhatsApp e CPF (db/011). -->
              <p v-if="a.telefone || a.documento" class="truncate text-footnote text-label-2">
                <template v-if="a.telefone">WhatsApp: {{ masks.phone(a.telefone) }}</template>
                <template v-if="a.telefone && a.documento"> · </template>
                <template v-if="a.documento">{{ a.documento.length === 14 ? 'CNPJ' : 'CPF' }}: {{ a.documento.length === 14 ? masks.cnpj(a.documento) : masks.cpf(a.documento) }}</template>
              </p>
            </div>
            <div class="flex items-center gap-1">
              <UiButton v-if="a.comissao_a_pagar > 0" variante="tinted" tamanho="small" :disabled="ocupado" @click="afiliadoParaPagar = a">
                Pagar {{ dinheiro(a.comissao_a_pagar) }}
              </UiButton>
              <button type="button" :class="[acaoIcone, 'hover:bg-accent/10 hover:text-accent']" :aria-label="`Editar ${a.nome}`" title="Editar" :disabled="ocupado" @click="abrirAfiliado(a)">
                <PencilSquareIcon class="h-5 w-5" />
              </button>
              <button type="button" :class="[acaoIcone, 'hover:bg-danger/10 hover:text-danger']" :aria-label="`Apagar ${a.nome}`" title="Apagar" :disabled="ocupado" @click="afiliadoParaApagar = a">
                <TrashIcon class="h-5 w-5" />
              </button>
            </div>
          </div>
          <div class="mt-2 flex items-center gap-2 rounded-lg bg-fill-2 px-3 py-1.5">
            <LinkIcon class="h-4 w-4 shrink-0 text-label-2" />
            <span class="min-w-0 flex-1 truncate font-mono text-footnote">{{ a.link }}</span>
            <button type="button" class="flex h-8 w-8 items-center justify-center rounded-full text-label-2 hover:bg-accent/10 hover:text-accent" :aria-label="`Copiar link de ${a.nome}`" title="Copiar link" @click="copiar(a.link)">
              <component :is="copiado === a.link ? CheckIcon : ClipboardDocumentIcon" class="h-4 w-4" />
            </button>
          </div>
          <dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-footnote sm:grid-cols-4">
            <div><dt class="text-label-2">Assinantes ativos</dt><dd class="font-semibold tabular-nums">{{ a.assinantes_ativos }}</dd></div>
            <div><dt class="text-label-2">Vendido</dt><dd class="font-semibold tabular-nums">{{ dinheiro(a.total_vendido) }}</dd></div>
            <div><dt class="text-label-2">A pagar</dt><dd class="font-semibold tabular-nums" :class="a.comissao_a_pagar > 0 ? 'text-warning' : ''">{{ dinheiro(a.comissao_a_pagar) }}</dd></div>
            <div><dt class="text-label-2">Já pago</dt><dd class="font-semibold tabular-nums">{{ dinheiro(a.comissao_paga) }}</dd></div>
          </dl>
        </div>
      </UiSection>

      <!-- ASSINANTES -->
      <UiSection titulo="Assinantes" lista>
        <template #acao>
          <div class="w-48">
            <UiSegmented
              v-model="filtro"
              rotulo="Filtro de assinantes"
              :opcoes="[
                { valor: 'ativas', rotulo: 'Ativos' },
                { valor: 'todas', rotulo: 'Todos' },
              ]"
            />
          </div>
        </template>
        <UiEmpty
          v-if="assinaturasVisiveis.length === 0"
          :icone="UsersIcon"
          :titulo="filtro === 'ativas' ? 'Nenhum assinante ativo' : 'Nenhuma assinatura ainda'"
          texto="Quem assinar pela página de venda aparece aqui assim que o cartão for autorizado."
        />
        <div v-for="a in assinaturasVisiveis" :key="a.id" class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-center gap-2 text-headline font-semibold">
              <span class="truncate">{{ a.nome }}</span>
              <UiBadge :tom="STATUS[a.status].tom">{{ STATUS[a.status].rotulo }}</UiBadge>
              <UiBadge v-if="a.afiliado_nome" tom="indigo">via {{ a.afiliado_nome }}</UiBadge>
            </p>
            <p class="truncate text-footnote text-label-2">{{ a.email }}</p>
            <p class="text-footnote text-label-2">
              {{ dinheiro(a.valor) }}/mês · desde {{ data(a.ativada_em) }} ·
              <template v-if="a.status === 'ativa'">próxima cobrança {{ data(a.proxima_cobranca) }}</template>
              <template v-else-if="a.status === 'cancelada'">cancelada em {{ data(a.cancelada_em) }}</template>
              <template v-else>cobrança pausada no Mercado Pago</template>
              · {{ a.mensalidades_pagas }} {{ a.mensalidades_pagas === 1 ? 'mensalidade paga' : 'mensalidades pagas' }} ({{ dinheiro(a.total_pago) }})
            </p>
          </div>
          <div v-if="a.status === 'ativa'" class="flex items-center gap-1">
            <button type="button" :class="[acaoIcone, 'hover:bg-accent/10 hover:text-accent']" :aria-label="`Reenviar acesso de ${a.nome}`" title="Reenviar o e-mail de acesso (link de senha novo)" :disabled="ocupado" @click="reenviar(a)">
              <EnvelopeIcon class="h-5 w-5" />
            </button>
            <button type="button" :class="[acaoIcone, 'hover:bg-danger/10 hover:text-danger']" :aria-label="`Cancelar assinatura de ${a.nome}`" title="Cancelar assinatura" :disabled="ocupado" @click="assinaturaParaCancelar = a">
              <XCircleIcon class="h-5 w-5" />
            </button>
          </div>
        </div>
      </UiSection>
    </div>

    <!-- FOLHA DO AFILIADO -->
    <UiSheet
      :aberto="!!afiliadoForm"
      :titulo="afiliadoForm?.id ? 'Editar afiliado' : 'Novo afiliado'"
      subtitulo="O código vira o link de divulgação dele"
      :bloqueado="ocupado"
      @fechar="afiliadoForm = null"
    >
      <form v-if="afiliadoForm" id="form-afiliado" class="space-y-4" @submit.prevent="salvarAfiliado">
        <UiTextField v-model="afiliadoForm.nome" rotulo="Nome" maxlength="255" required />
        <UiTextField v-model="afiliadoForm.email" rotulo="E-mail" type="email" maxlength="255" />
        <UiTextField v-model="afiliadoForm.chave_pix" rotulo="Chave Pix (para o repasse)" maxlength="255" />
        <UiTextField
          v-model="afiliadoForm.codigo"
          rotulo="Código do link"
          maxlength="40"
          placeholder="ex.: joao"
          :dica="`${base}/assine?ref=${afiliadoForm.codigo || 'codigo'} — em branco, usa o nome.`"
        />
        <UiTextField
          v-model="afiliadoForm.comissao_pct"
          rotulo="Comissão deste afiliado (%)"
          inputmode="decimal"
          :placeholder="`padrão: ${comissaoPadrao || '5'}`"
          dica="Em branco, vale a comissão padrão do plano."
        />
        <UiSwitch v-model="afiliadoForm.ativo" rotulo="Ativo (o link conta indicações e gera comissão)" />
      </form>
      <template #acoes>
        <UiButton variante="gray" :disabled="ocupado" @click="afiliadoForm = null">Cancelar</UiButton>
        <UiButton type="submit" form="form-afiliado" :carregando="ocupado" :disabled="!afiliadoForm?.nome.trim()">Salvar</UiButton>
      </template>
    </UiSheet>

    <UiAlert
      :aberto="!!afiliadoParaPagar"
      tom="success"
      :icone="BanknotesIcon"
      titulo="Registrar pagamento da comissão"
      :destaque="afiliadoParaPagar ? `${afiliadoParaPagar.nome} · ${dinheiro(afiliadoParaPagar.comissao_a_pagar)}` : undefined"
      mensagem="Marca toda a comissão em aberto deste afiliado como paga. Faça o Pix antes; aqui é só o registro."
      confirmar="Marcar como pago"
      @fechar="afiliadoParaPagar = null"
      @confirmar="confirmarPagamento"
    />

    <UiAlert
      :aberto="!!afiliadoParaApagar"
      tom="danger"
      :icone="TrashIcon"
      titulo="Apagar afiliado"
      :destaque="afiliadoParaApagar?.nome"
      mensagem="Só é possível apagar afiliado sem nenhuma indicação. Com histórico, desative em vez de apagar."
      confirmar="Apagar"
      @fechar="afiliadoParaApagar = null"
      @confirmar="confirmarApagarAfiliado"
    />

    <UiAlert
      :aberto="!!assinaturaParaCancelar"
      tom="danger"
      :icone="XCircleIcon"
      titulo="Cancelar assinatura"
      :destaque="assinaturaParaCancelar?.nome"
      mensagem="O Mercado Pago para de cobrar e a pessoa perde o acesso ao aplicativo. Para voltar, ela precisa assinar de novo."
      confirmar="Cancelar assinatura"
      cancelar="Voltar"
      @fechar="assinaturaParaCancelar = null"
      @confirmar="confirmarCancelamento"
    />
  </div>
</template>
