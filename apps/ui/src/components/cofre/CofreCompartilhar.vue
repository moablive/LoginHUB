<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import axios from 'axios';
import { ShieldCheckIcon, UserMinusIcon, UserPlusIcon } from '@heroicons/vue/24/outline';
import type { CofrePapel } from '@loginhub/schema';
import UiAlert from '@/components/ui/UiAlert.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import UiSheet from '@/components/ui/UiSheet.vue';
import UiTextField from '@/components/ui/UiTextField.vue';
import { useCofre } from '@/features/cofre/useCofre';

/**
 * Folha de compartilhar um cofre com outra conta do LoginHUB (26/11/2026, db/022). Tudo continua de ponta a ponta: o
 * navegador sela a chave do cofre para a chave pública da pessoa; o servidor só guarda o selo.
 *
 * Passos: e-mail da conta (que já tenha aberto o cofre dela) → CÓDIGO DE VERIFICAÇÃO da chave dela, que você confere com
 * ela por outro canal (o servidor poderia entregar uma chave que não é dela) → Compartilhar. Tirar alguém gira a chave
 * do cofre; quem já copiou uma senha antes continua com ela.
 */
const props = defineProps<{ cofre: { id: string; nome: string } | null }>();
const emit = defineEmits<{ fechar: [] }>();

const hub = useCofre();
const { meuCodigo, podeCompartilhar, offline } = hub;

const email = ref('');
const papel = ref<CofrePapel>('leitura');
const encontrado = ref<{ dono: string; chave_publica: string; codigo: string; email: string } | null>(null);
const conferi = ref(false);
const ocupado = ref(false);
const erro = ref<string | null>(null);
const aviso = ref<string | null>(null);
const quemRemover = ref<{ membro: string; nome: string } | null>(null);
const girando = ref(false);

const membros = computed(() => (props.cofre ? hub.membrosDe(props.cofre.id) : []));
const rotuloDoPapel = (p: CofrePapel) => (p === 'escrita' ? 'Leitura e escrita' : 'Somente leitura');
const OPCOES_PAPEL = [
  { valor: 'leitura', rotulo: 'Somente leitura (vê e copia as senhas)' },
  { valor: 'escrita', rotulo: 'Leitura e escrita (também cria, edita e apaga itens)' },
];

watch(
  () => props.cofre?.id,
  () => {
    email.value = '';
    papel.value = 'leitura';
    encontrado.value = null;
    conferi.value = false;
    erro.value = null;
    aviso.value = null;
  },
);

const MENSAGENS: Record<string, string> = {
  OFFLINE: 'Sem internet: compartilhar volta com a rede.',
  SOU_EU: 'Este é o seu próprio e-mail.',
  SO_O_DONO: 'Só o dono do cofre pode compartilhá-lo.',
  ITENS_ILEGIVEIS: 'Alguns itens deste cofre não abrem, então a chave não pode girar sem perdê-los. Sincronize e tente de novo.',
  MEMBRO_ADULTERADO: 'A chave de uma das pessoas não confere com a que você aprovou. Por segurança nada foi enviado. Tire essa pessoa e convide de novo, conferindo o código.',
  SELOS_NAO_ATUALIZADOS: 'O cofre foi salvo, mas não consegui atualizar o nome para todas as pessoas. Abra Compartilhar e tente de novo.',
};
function mensagemDe(e: unknown, padrao: string): string {
  if (e instanceof Error && MENSAGENS[e.message]) return MENSAGENS[e.message]!;
  if (axios.isAxiosError(e) && e.response?.status === 429) return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
  if (axios.isAxiosError(e) && e.response?.data?.message) return String(e.response.data.message);
  return padrao;
}

async function procurar() {
  erro.value = null;
  aviso.value = null;
  encontrado.value = null;
  conferi.value = false;
  ocupado.value = true;
  try {
    const p = await hub.buscarConvidado(email.value);
    encontrado.value = { ...p, email: email.value.trim().toLowerCase() };
  } catch (e) {
    erro.value = mensagemDe(e, 'Não foi possível procurar esta conta.');
  } finally {
    ocupado.value = false;
  }
}

async function compartilhar() {
  const alvo = encontrado.value;
  if (!props.cofre || !alvo || !conferi.value) return;
  ocupado.value = true;
  erro.value = null;
  try {
    await hub.convidar(props.cofre.id, alvo, papel.value);
    aviso.value = `${alvo.email} agora abre este cofre (${rotuloDoPapel(papel.value).toLowerCase()}).`;
    encontrado.value = null;
    conferi.value = false;
    email.value = '';
  } catch (e) {
    erro.value = mensagemDe(e, 'Não foi possível compartilhar o cofre.');
  } finally {
    ocupado.value = false;
  }
}

async function mudarPapel(membro: string, novo: string) {
  if (!props.cofre || (novo !== 'leitura' && novo !== 'escrita')) return;
  ocupado.value = true;
  erro.value = null;
  try {
    await hub.mudarPapel(props.cofre.id, membro, novo);
  } catch (e) {
    erro.value = mensagemDe(e, 'Não foi possível mudar o papel.');
  } finally {
    ocupado.value = false;
  }
}

async function remover() {
  const alvo = quemRemover.value;
  if (!props.cofre || !alvo) return;
  ocupado.value = true;
  erro.value = null;
  try {
    await hub.removerMembro(props.cofre.id, alvo.membro);
    aviso.value = `${alvo.nome} saiu do cofre e a chave foi trocada.`;
  } catch (e) {
    erro.value = mensagemDe(e, 'Não foi possível tirar esta pessoa.');
  } finally {
    ocupado.value = false;
    quemRemover.value = null;
  }
}

async function girar() {
  if (!props.cofre) return;
  ocupado.value = true;
  erro.value = null;
  try {
    await hub.girarChave(props.cofre.id);
    aviso.value = 'A chave do cofre foi trocada.';
  } catch (e) {
    erro.value = mensagemDe(e, 'Não foi possível trocar a chave.');
  } finally {
    ocupado.value = false;
    girando.value = false;
  }
}
</script>

<template>
  <UiSheet :aberto="!!cofre" titulo="Compartilhar cofre" :subtitulo="cofre?.nome" largura="md" :bloqueado="ocupado" @fechar="emit('fechar')">
    <div class="space-y-4">
      <div class="flex gap-3 rounded-celula bg-fill-2 p-3 text-footnote text-label-2">
        <ShieldCheckIcon class="h-5 w-5 shrink-0 text-success" />
        <p>
          Continua cifrado de ponta a ponta: a chave do cofre vai selada só para a pessoa escolhida e o servidor não lê nada. A conta dela
          precisa já ter aberto o cofre dela pelo menos uma vez.
        </p>
      </div>

      <p v-if="offline" role="status" class="rounded-celula bg-warning/10 p-3 text-subhead text-warning">Sem internet: compartilhar volta com a rede.</p>
      <p v-else-if="!podeCompartilhar" role="status" class="rounded-celula bg-warning/10 p-3 text-subhead text-warning">
        Gerando as chaves desta conta. Feche e abra esta folha em alguns segundos; se não passar, sincronize o cofre.
      </p>

      <section class="space-y-3" aria-label="Convidar">
        <form class="space-y-3" @submit.prevent="procurar">
          <UiTextField v-model="email" rotulo="E-mail da conta" type="email" inputmode="email" autocomplete="off" placeholder="nome@exemplo.com" required :disabled="!podeCompartilhar" />
          <UiSelect v-model="papel" rotulo="O que a pessoa pode fazer" :opcoes="OPCOES_PAPEL" :disabled="!podeCompartilhar" />
          <UiButton type="submit" variante="tinted" bloco :carregando="ocupado && !encontrado" :disabled="!podeCompartilhar || !email.trim()">
            <UserPlusIcon class="h-5 w-5" />Procurar conta
          </UiButton>
        </form>

        <div v-if="encontrado" class="space-y-3 rounded-celula bg-surface p-3 ring-1 ring-separator">
          <p class="text-subhead">
            Conta encontrada: <strong class="break-all">{{ encontrado.email }}</strong>
          </p>
          <p class="text-footnote text-label-2">Peça à pessoa o código dela (aparece nesta mesma folha, no cofre dela) por telefone ou mensagem e confira:</p>
          <p class="select-all break-all rounded-lg bg-fill-2 p-3 text-center font-mono text-headline tracking-wider" aria-label="Código de verificação da conta encontrada">{{ encontrado.codigo }}</p>
          <label class="flex items-start gap-2 text-subhead">
            <input v-model="conferi" type="checkbox" class="mt-0.5 h-5 w-5" />
            Conferi: o código é igual ao que a pessoa me falou.
          </label>
          <div class="flex gap-2">
            <UiButton variante="gray" :disabled="ocupado" @click="(encontrado = null), (conferi = false)">Cancelar</UiButton>
            <UiButton class="flex-1" :carregando="ocupado" :disabled="!conferi" @click="compartilhar">Compartilhar</UiButton>
          </div>
        </div>
      </section>

      <p v-if="aviso" role="status" class="rounded-celula bg-success/10 p-3 text-subhead text-success">{{ aviso }}</p>
      <p v-if="erro" role="alert" class="rounded-celula bg-danger/10 p-3 text-subhead text-danger">{{ erro }}</p>

      <section aria-label="Quem abre este cofre" class="space-y-2">
        <h3 class="px-1 text-subhead font-semibold text-label-2">Quem abre este cofre</h3>
        <p v-if="membros.length === 0" class="py-2 text-subhead italic text-label-2">Só você, por enquanto.</p>
        <ul v-else class="divide-y rounded-celula bg-surface [&>*]:border-separator">
          <li v-for="m in membros" :key="m.membro" class="space-y-2 px-3 py-3">
            <div class="flex items-center gap-2">
              <p class="min-w-0 flex-1 break-all text-subhead font-semibold">{{ m.nome ?? 'Outra conta' }}</p>
              <UiBadge :tom="m.papel === 'escrita' ? 'accent' : 'neutro'">{{ rotuloDoPapel(m.papel) }}</UiBadge>
            </div>
            <div class="flex items-center gap-2">
              <div class="min-w-0 flex-1">
                <UiSelect :model-value="m.papel" :opcoes="OPCOES_PAPEL" :disabled="ocupado || offline" aria-label="Papel de acesso" @update:model-value="mudarPapel(m.membro, $event)" />
              </div>
              <UiButton variante="destructive-tinted" tamanho="small" :disabled="ocupado || offline" @click="quemRemover = { membro: m.membro, nome: m.nome ?? 'Esta pessoa' }">
                <UserMinusIcon class="h-4 w-4" />Tirar
              </UiButton>
            </div>
          </li>
        </ul>
        <UiButton v-if="membros.length > 0" variante="plain" tamanho="small" :disabled="ocupado || offline" @click="girando = true">Trocar a chave do cofre</UiButton>
      </section>

      <section v-if="meuCodigo" aria-label="Seu código" class="space-y-1 rounded-celula bg-fill-2 p-3">
        <p class="text-footnote text-label-2">O seu código de verificação (diga a quem for compartilhar um cofre com você):</p>
        <p class="select-all break-all text-center font-mono text-subhead tracking-wider">{{ meuCodigo }}</p>
      </section>
    </div>
    <template #acoes>
      <UiButton variante="gray" @click="emit('fechar')">Fechar</UiButton>
    </template>
  </UiSheet>

  <UiAlert
    :aberto="!!quemRemover"
    tom="danger"
    titulo="Tirar esta pessoa do cofre?"
    :destaque="quemRemover?.nome"
    confirmar="Tirar e trocar a chave"
    :carregando="ocupado"
    @fechar="quemRemover = null"
    @confirmar="remover"
  >
    A pessoa perde o acesso e a chave do cofre é trocada (todos os itens são recifrados). <strong class="text-danger">Quem já copiou uma senha antes continua com ela:</strong>
    troque as senhas mais sensíveis.
  </UiAlert>

  <UiAlert :aberto="girando" tom="warning" titulo="Trocar a chave do cofre?" confirmar="Trocar a chave" :carregando="ocupado" @fechar="girando = false" @confirmar="girar">
    Os itens são recifrados com uma chave nova e as pessoas que ficam recebem a nova. Quem já viu uma senha continua sabendo dela.
  </UiAlert>
</template>
