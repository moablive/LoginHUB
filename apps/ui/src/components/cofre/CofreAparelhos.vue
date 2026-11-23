<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import axios from 'axios';
import { cofreApi } from '@loginhub/api-client';
import type { CofreAparelho, CofreAparelhoPedido } from '@loginhub/schema';
import UiAlert from '@/components/ui/UiAlert.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiSheet from '@/components/ui/UiSheet.vue';
import UiTextField from '@/components/ui/UiTextField.vue';
import { formatarCodigo, limparCodigo, pareamentoSuportado } from '@/features/cofre/pareamento';
import { useCofre } from '@/features/cofre/useCofre';

/**
 * Máquinas do CLI `hub-pass` (db/014 e db/017). Além de listar e revogar, é
 * aqui que uma máquina nova é aprovada (23/11/2026, pedido do dono): ela mostra
 * um código no `hub-pass login`, a pessoa digita com o cofre aberto (pela
 * digital ou pela palavra-passe), escolhe os cofres e aprova. Nada é digitado
 * na máquina. O alcance pode ser mudado depois, pelo botão "Cofres".
 */
const props = defineProps<{
  aberto: boolean;
  /** Código que veio no link `?aprovar=` do `hub-pass login`. */
  codigoInicial?: string;
}>();
const emit = defineEmits<{ fechar: [] }>();

const cofre = useCofre();
const { cofres } = cofre;

const aparelhos = ref<CofreAparelho[]>([]);
const erro = ref<string | null>(null);
const aviso = ref<string | null>(null);
const ocupado = ref(false);

const mensagemDe = (e: unknown, padrao: string): string => {
  if (e instanceof Error && e.message === 'PEDIDO_ADULTERADO') return 'O código não confere com a chave que o servidor entregou. Não aprove: rode hub-pass login de novo.';
  if (e instanceof Error && e.message === 'APARELHO_ADULTERADO') return 'A chave desta máquina não é a que foi aprovada. Não mude o acesso: revogue e aprove de novo.';
  if (axios.isAxiosError(e) && e.response?.data?.message) return String(e.response.data.message);
  return padrao;
};
const dataHora = (d: string | Date | null) =>
  d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

async function carregar() {
  try {
    aparelhos.value = await cofreApi.aparelhos();
  } catch (e) {
    erro.value = mensagemDe(e, 'Não foi possível listar os aparelhos.');
  }
}

// --- alcance: os cofres marcados, ou a conta inteira. Serve ao pedido novo e ao "Cofres" de uma máquina.
const contaInteira = ref(false);
const marcados = ref(new Set<string>());
function alternarCofre(id: string) {
  const s = new Set(marcados.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  marcados.value = s;
}
const alcance = computed<string[] | null>(() => (contaInteira.value ? null : [...marcados.value]));
const alcanceValido = computed(() => contaInteira.value || marcados.value.size > 0);
function prepararAlcance(atual: string[] | null | undefined) {
  contaInteira.value = atual === null;
  marcados.value = new Set((atual ?? []).filter((id) => cofres.value.some((c) => c.id === id)));
}
const nomesDosCofres = (ids: string[]) => ids.map((id) => cofres.value.find((c) => c.id === id)?.nome ?? '(cofre apagado)').join(', ');

// --- aprovar uma máquina nova
const codigo = ref('');
const pedido = ref<CofreAparelhoPedido | null>(null);
async function buscar() {
  erro.value = null;
  aviso.value = null;
  editando.value = null;
  ocupado.value = true;
  try {
    pedido.value = await cofre.buscarPedidoDeAparelho(codigo.value);
    prepararAlcance(undefined);
  } catch (e) {
    pedido.value = null;
    erro.value = mensagemDe(e, 'Não foi possível buscar o pedido.');
  } finally {
    ocupado.value = false;
  }
}
async function aprovar() {
  const p = pedido.value;
  if (!p || !alcanceValido.value) return;
  ocupado.value = true;
  erro.value = null;
  try {
    await cofre.aprovarAparelho(p, alcance.value);
    aviso.value = `Máquina "${p.nome}" aprovada. O hub-pass dela já pode ler o cofre.`;
    pedido.value = null;
    codigo.value = '';
    await carregar();
  } catch (e) {
    erro.value = mensagemDe(e, 'Não foi possível aprovar a máquina.');
  } finally {
    ocupado.value = false;
  }
}

// --- mudar os cofres de uma máquina já aprovada (só as aprovadas pelo navegador têm chave pública)
const editando = ref<CofreAparelho | null>(null);
function editarAcesso(a: CofreAparelho) {
  erro.value = null;
  aviso.value = null;
  pedido.value = null;
  editando.value = a;
  prepararAlcance(a.cofres);
}
async function salvarAcesso() {
  const a = editando.value;
  if (!a || !alcanceValido.value) return;
  ocupado.value = true;
  erro.value = null;
  try {
    await cofre.alterarAcessoDoAparelho(a, alcance.value);
    aviso.value = `Acesso de "${a.nome}" atualizado.`;
    editando.value = null;
    await carregar();
  } catch (e) {
    erro.value = mensagemDe(e, 'Não foi possível mudar o acesso.');
  } finally {
    ocupado.value = false;
  }
}

const paraRevogar = ref<CofreAparelho | null>(null);
async function revogar() {
  const alvo = paraRevogar.value;
  if (!alvo) return;
  ocupado.value = true;
  try {
    await cofreApi.revogarAparelho(alvo.id);
    if (editando.value?.id === alvo.id) editando.value = null;
    await carregar();
  } catch (e) {
    erro.value = mensagemDe(e, 'Não foi possível revogar.');
  } finally {
    ocupado.value = false;
    paraRevogar.value = null;
  }
}

watch(
  () => props.aberto,
  async (abriu) => {
    if (!abriu) return;
    erro.value = null;
    aviso.value = null;
    pedido.value = null;
    editando.value = null;
    codigo.value = props.codigoInicial ? formatarCodigo(limparCodigo(props.codigoInicial)) : '';
    await carregar();
    if (limparCodigo(codigo.value).length === 12) await buscar();
  },
  { immediate: true },
);
</script>

<template>
  <UiSheet :aberto="aberto" titulo="Aparelhos do CLI" subtitulo="Máquinas aprovadas para o hub-pass" largura="md" :bloqueado="ocupado" @fechar="emit('fechar')">
    <div class="space-y-4">
      <div class="rounded-celula bg-fill-2 p-3 text-footnote text-label-2">
        Para aprovar uma máquina, rode nela <code class="font-mono text-label">hub-pass login</code>: ela mostra um código de 12
        letras. Digite o código aqui, escolha os cofres e aprove. Nenhuma senha é digitada na máquina, e revogar desliga na hora.
      </div>

      <p v-if="!pareamentoSuportado()" class="rounded-celula bg-warning/10 p-3 text-subhead text-warning">Este navegador não consegue aprovar máquinas (sem WebCrypto).</p>
      <form v-else-if="!pedido && !editando" class="flex items-end gap-2" @submit.prevent="buscar">
        <UiTextField v-model="codigo" rotulo="Código do pedido" placeholder="XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="20" />
        <UiButton type="submit" variante="tinted" :carregando="ocupado" :disabled="limparCodigo(codigo).length !== 12">Buscar</UiButton>
      </form>

      <p v-if="erro" role="alert" class="rounded-celula bg-danger/10 p-3 text-subhead text-danger">{{ erro }}</p>
      <p v-if="aviso" class="rounded-celula bg-success/10 p-3 text-subhead text-success">{{ aviso }}</p>

      <!-- pedido novo, ou os cofres de uma máquina aprovada -->
      <form v-if="pedido || editando" class="space-y-3 rounded-celula bg-surface-2 p-3" @submit.prevent="pedido ? aprovar() : salvarAcesso()">
        <div v-if="pedido">
          <p class="text-headline font-semibold">Aprovar “{{ pedido.nome }}”?</p>
          <p class="text-caption-1 text-label-2">
            pedido de {{ dataHora(pedido.criado_em) }}{{ pedido.ip ? ` · ${pedido.ip}` : '' }} · código
            <span class="font-mono">{{ formatarCodigo(limparCodigo(codigo)) }}</span> conferido com a chave da máquina
          </p>
        </div>
        <p v-else-if="editando" class="text-headline font-semibold">Cofres de “{{ editando.nome }}”</p>

        <fieldset class="space-y-1">
          <legend class="mb-1 px-1 text-footnote font-medium text-label-2">O que a máquina pode abrir</legend>
          <label class="flex min-h-toque items-center gap-2 text-subhead">
            <input v-model="contaInteira" type="radio" name="alcance" :value="false" class="h-5 w-5" />
            Só os cofres marcados
          </label>
          <ul v-if="!contaInteira" class="ml-7 divide-y rounded-celula bg-surface [&>*]:border-separator">
            <li v-for="c in cofres" :key="c.id">
              <label class="flex min-h-toque items-center gap-2 px-3 text-subhead">
                <input type="checkbox" class="h-5 w-5" :checked="marcados.has(c.id)" @change="alternarCofre(c.id)" />
                <span class="truncate">{{ c.nome }}</span>
              </label>
            </li>
            <li v-if="cofres.length === 0" class="px-3 py-3 text-subhead italic text-label-2">Nenhum cofre ainda.</li>
          </ul>
          <label class="flex min-h-toque items-center gap-2 text-subhead">
            <input v-model="contaInteira" type="radio" name="alcance" :value="true" class="h-5 w-5" />
            Todos os cofres (a conta inteira)
          </label>
          <p v-if="contaInteira" class="ml-7 text-footnote text-warning">
            A máquina abre todos os cofres de hoje e os que vierem, e pode criar cofres. Se ela for invadida, leva o cofre inteiro.
          </p>
          <p v-else class="ml-7 text-footnote text-label-2">
            A máquina só recebe e só grava nesses cofres. Cofre novo ou renomeado: volte aqui, em “Cofres”, e salve de novo.
          </p>
        </fieldset>

        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <UiButton variante="gray" @click="(pedido = null), (editando = null)">Cancelar</UiButton>
          <UiButton type="submit" :carregando="ocupado" :disabled="!alcanceValido">{{ pedido ? 'Aprovar a máquina' : 'Salvar' }}</UiButton>
        </div>
      </form>

      <p v-if="aparelhos.length === 0" class="py-3 text-subhead italic text-label-2">Nenhuma máquina aprovada ainda.</p>
      <ul v-else class="divide-y rounded-celula bg-surface [&>*]:border-separator">
        <li v-for="a in aparelhos" :key="a.id" class="flex items-center gap-3 px-3 py-3">
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-2 text-subhead font-semibold">
              <span class="truncate">{{ a.nome }}</span>
              <UiBadge v-if="a.revogado" tom="danger">revogado</UiBadge>
              <UiBadge v-else tom="success">ativo</UiBadge>
            </p>
            <p class="text-caption-1 text-label-2">aprovado {{ dataHora(a.criado_em) }} · último uso {{ dataHora(a.ultimo_uso) }}{{ a.ip ? ` · ${a.ip}` : '' }}</p>
            <p v-if="!a.revogado" class="text-caption-1 text-label-2">
              {{ a.cofres ? `abre ${a.cofres.length === 1 ? '1 cofre' : `${a.cofres.length} cofres`}: ${nomesDosCofres(a.cofres)}` : 'abre todos os cofres (a conta inteira)' }}
            </p>
          </div>
          <div v-if="!a.revogado" class="flex shrink-0 flex-col gap-1 sm:flex-row">
            <UiButton v-if="a.chave_publica" variante="tinted" tamanho="small" @click="editarAcesso(a)">Cofres</UiButton>
            <UiButton variante="destructive-tinted" tamanho="small" @click="paraRevogar = a">Revogar</UiButton>
          </div>
        </li>
      </ul>
    </div>
  </UiSheet>

  <UiAlert
    :aberto="!!paraRevogar"
    tom="danger"
    titulo="Revogar esta máquina?"
    :destaque="paraRevogar?.nome"
    confirmar="Revogar"
    :carregando="ocupado"
    @fechar="paraRevogar = null"
    @confirmar="revogar"
  >
    O hub-pass dela para de funcionar na hora. Para voltar, rode <code>hub-pass login</code> nela de novo.
  </UiAlert>
</template>
