<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { ArrowRightOnRectangleIcon, FingerPrintIcon, KeyIcon, LockClosedIcon } from '@heroicons/vue/24/outline';
import { cofreApi } from '@loginhub/api-client';
import type { CofreEntradaPedido } from '@loginhub/schema';
import AuthShell from '@/components/AuthShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiTextField from '@/components/ui/UiTextField.vue';
import UiSpinner from '@/components/ui/UiSpinner.vue';
import { useCofre, type ItemAberto } from '@/features/cofre/useCofre';
import { digitalSuportada, ErroDigital } from '@/features/cofre/digital';
import { entradaSuportada } from '@/features/cofre/entrada';
import { ErroEntradaPorItem, itensDeLoginDoApp, passeDeCadastroPeloItem } from '@/features/cofre/entradaPorItem';
import { lerTotp } from '@/features/cofre/cripto';

/**
 * /cofre/entrada?passe=… (19/11/2026, db/016, pedido do dono: "a biometria do
 * Escritórios deve usar o próprio cofre que criamos hoje pelo LoginHUB").
 *
 * Um app (hoje o Escritórios 3D) manda a pessoa para cá com um passe de 5 min:
 *   cadastro → guarda neste cofre a chave de entrada da conta que estava logada no app;
 *   entrar   → o cofre aberto assina o desafio com essa chave e devolve ao app.
 * O cofre abre com a digital (Touch ID/Face ID do próprio aparelho) ou com a
 * palavra-passe. Nada sai daqui além da chave pública (no cadastro) e da
 * assinatura (na entrada); a volta é sempre para a origem do app cadastrada no hub.
 */
const route = useRoute();
const router = useRouter();
const cofre = useCofre();
const { existe, aberto, temDigital } = cofre;

const passe = typeof route.query.passe === 'string' ? route.query.passe : '';
const etapa = ref<'carregando' | 'sem-sessao' | 'erro' | 'cofre' | 'saindo'>('carregando');
const pedido = ref<CofreEntradaPedido | null>(null);
const erro = ref<string | null>(null);
const ocupado = ref(false);
const palavra = ref('');
const usarSenha = ref(false);

const nomeDoAparelho = (): string => {
  const ua = navigator.userAgent;
  const sistema = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Aparelho';
  return `Cofre do LoginHUB · ${sistema}`;
};

const MENSAGEM_DIGITAL: Record<ErroDigital['codigo'], string> = {
  SEM_SUPORTE: 'Este navegador não tem passkey. Use a palavra-passe.',
  SEM_PRF: 'Este aparelho não devolveu o segredo da digital. Use a palavra-passe.',
  // Aqui o silêncio parecia botão morto (24/11/2026): o leitor fechado sem digital também cai neste código.
  CANCELADO: 'A digital não abriu o cofre: o leitor foi fechado ou este navegador não achou a digital. Tente de novo ou use a palavra-passe.',
  NAO_RECONHECIDA: 'Digital não reconhecida.',
};
function mensagemDe(e: unknown, padrao: string): string {
  if (e instanceof ErroDigital) return MENSAGEM_DIGITAL[e.codigo];
  if (e instanceof ErroEntradaPorItem) return e.message;
  if (e instanceof Error && e.message === 'CHAVE_ERRADA') return 'Palavra-passe errada.';
  if (axios.isAxiosError(e) && e.response?.data?.message) return String(e.response.data.message);
  return padrao;
}

const entradas = computed<ItemAberto[]>(() => (pedido.value && aberto.value ? cofre.entradasDoApp(pedido.value.app.id) : []));
// Sem chave de entrada ainda, mas com o login do app guardado no cofre: o cofre faz o login e guarda a chave.
// Com mais de um item do mesmo endereço, o que tem o 2FA guardado vem primeiro: sem o código o hub recusa o login.
const itensDeLogin = computed<ItemAberto[]>(() =>
  pedido.value?.acao === 'entrar' && aberto.value && !entradas.value.length
    ? itensDeLoginDoApp(cofre.itens.value, pedido.value.app.origem).sort((a, b) => Number(!!lerTotp(b.totp)) - Number(!!lerTotp(a.totp)))
    : [],
);
/** Dois itens com o mesmo usuário dariam dois botões iguais: aí o botão diz também o item e o cofre. */
const rotuloDoItem = (i: ItemAberto): string => {
  if (itensDeLogin.value.length < 2) return i.usuario;
  const doCofre = cofre.cofres.value.find((c) => c.id === i.cofre_id)?.nome;
  return `${i.usuario} · ${i.titulo}${doCofre ? ` (${doCofre})` : ''}${lerTotp(i.totp) ? '' : ' · sem 2FA'}`;
};
const jaGuardada = computed(() => !!pedido.value?.conta && entradas.value.some((i) => i.entrada?.usuario_id === pedido.value?.conta?.id));

onMounted(async () => {
  if (!passe) {
    erro.value = 'Link sem o pedido do aplicativo. Volte ao aplicativo e tente de novo.';
    etapa.value = 'erro';
    return;
  }
  if (!entradaSuportada()) {
    erro.value = 'Este navegador não assina a entrada (Ed25519). Atualize o navegador.';
    etapa.value = 'erro';
    return;
  }
  try {
    await cofre.carregar();
  } catch (e) {
    const status = axios.isAxiosError(e) ? e.response?.status : undefined;
    if (status === 401 || status === 403) return void (etapa.value = 'sem-sessao');
    erro.value = mensagemDe(e, 'Não foi possível abrir o cofre.');
    etapa.value = 'erro';
    return;
  }
  if (!existe.value) {
    erro.value = 'Este login do LoginHUB ainda não tem cofre. Crie o cofre no painel e volte.';
    etapa.value = 'erro';
    return;
  }
  try {
    pedido.value = await cofreApi.pedidoDeEntrada(passe);
    etapa.value = 'cofre';
  } catch (e) {
    erro.value = mensagemDe(e, 'O pedido do aplicativo não vale mais.');
    etapa.value = 'erro';
  }
});

function entrarNoHub() {
  void router.push({ path: '/login', query: { volta: route.fullPath } });
}

async function abrirComDigital() {
  erro.value = null;
  ocupado.value = true;
  try {
    await cofre.abrirComDigital();
  } catch (e) {
    erro.value = mensagemDe(e, 'A digital não abriu o cofre.') || null;
  } finally {
    ocupado.value = false;
  }
}

async function abrirComSenha() {
  erro.value = null;
  ocupado.value = true;
  try {
    await cofre.abrirComSenha(palavra.value);
    palavra.value = '';
  } catch (e) {
    erro.value = mensagemDe(e, 'Palavra-passe errada.');
  } finally {
    ocupado.value = false;
  }
}

/** Volta ao app. A origem vem do hub (platform_url do app), nunca do link. */
function voltar(caminho: string, hash?: Record<string, string>) {
  const p = pedido.value;
  if (!p) return;
  cofre.trancar();
  etapa.value = 'saindo';
  const url = new URL(caminho, p.app.origem);
  if (hash) url.hash = new URLSearchParams(hash).toString();
  window.location.replace(url.toString());
}

async function guardar() {
  const p = pedido.value;
  if (!p) return;
  erro.value = null;
  ocupado.value = true;
  try {
    await cofre.guardarEntrada(passe, p, nomeDoAparelho());
    voltar('/', { 'cofre-entrada': 'guardada' });
  } catch (e) {
    erro.value = mensagemDe(e, 'Não deu para guardar a entrada no cofre.');
  } finally {
    ocupado.value = false;
  }
}

async function entrar(item: ItemAberto) {
  erro.value = null;
  ocupado.value = true;
  try {
    const { entrada_id, assinatura } = await cofre.assinarParaEntrar(item, passe);
    voltar('/entrar', { 'cofre-passe': passe, 'cofre-entrada': entrada_id, 'cofre-assinatura': assinatura });
  } catch (e) {
    erro.value = mensagemDe(e, 'Não deu para assinar a entrada.');
  } finally {
    ocupado.value = false;
  }
}

/** Entra com o login guardado no item, guarda a chave de entrada e assina o pedido do app. */
async function entrarComItem(item: ItemAberto) {
  const p = pedido.value;
  if (!p) return;
  erro.value = null;
  ocupado.value = true;
  try {
    const passeDeCadastro = await passeDeCadastroPeloItem(item, p.app.id);
    const cadastro = await cofreApi.pedidoDeEntrada(passeDeCadastro);
    if (cadastro.acao !== 'cadastro' || cadastro.app.id !== p.app.id) throw new Error('PASSE_INVALIDO');
    await cofre.guardarEntrada(passeDeCadastro, cadastro, nomeDoAparelho());
    const nova = cofre.entradasDoApp(p.app.id).find((i) => i.entrada?.usuario_id === cadastro.conta?.id);
    if (!nova) throw new Error('SEM_ENTRADA');
    await entrar(nova);
  } catch (e) {
    erro.value = mensagemDe(e, 'Não deu para entrar com o login guardado no cofre.');
  } finally {
    ocupado.value = false;
  }
}

const titulo = computed(() => {
  const p = pedido.value;
  if (!p) return 'Cofre do LoginHUB';
  return p.acao === 'cadastro' ? `Guardar a entrada do ${p.app.nome}` : `Entrar no ${p.app.nome}`;
});
const texto = computed(() => {
  const p = pedido.value;
  if (etapa.value === 'sem-sessao') return 'Entre no LoginHUB neste navegador para abrir o cofre.';
  if (!p) return undefined;
  if (!aberto.value) return 'Abra o cofre com a sua digital para continuar.';
  return p.acao === 'cadastro'
    ? `A chave fica cifrada neste cofre. Depois, o botão "Entrar pelo cofre" do ${p.app.nome} entra com ela.`
    : `Escolha a conta. O cofre assina a entrada e devolve você ao ${p.app.nome}.`;
});
</script>

<template>
  <AuthShell :titulo="titulo" :texto="texto" :icone="aberto ? KeyIcon : FingerPrintIcon">
    <div v-if="etapa === 'carregando' || etapa === 'saindo'" class="flex justify-center py-6"><UiSpinner /></div>

    <div v-else-if="etapa === 'sem-sessao'" class="space-y-4">
      <UiButton tamanho="large" bloco @click="entrarNoHub"><ArrowRightOnRectangleIcon class="h-5 w-5" /> Entrar no LoginHUB</UiButton>
    </div>

    <div v-else-if="etapa === 'erro'" class="space-y-4">
      <p role="alert" class="rounded-celula bg-danger/10 p-3 text-subhead text-danger">{{ erro }}</p>
    </div>

    <div v-else-if="pedido" class="space-y-4">
      <!-- trancado: digital primeiro, palavra-passe como reserva -->
      <template v-if="!aberto">
        <UiButton v-if="temDigital && digitalSuportada() && !usarSenha" tamanho="large" bloco :carregando="ocupado" @click="abrirComDigital">
          <FingerPrintIcon class="h-5 w-5" /> Abrir com a digital
        </UiButton>
        <form v-else class="space-y-3" @submit.prevent="abrirComSenha">
          <UiTextField v-model="palavra" rotulo="Palavra-passe do cofre" type="password" revelar autocomplete="current-password">
            <template #icone><LockClosedIcon /></template>
          </UiTextField>
          <UiButton type="submit" tamanho="large" bloco :carregando="ocupado" :disabled="!palavra">Abrir o cofre</UiButton>
        </form>
        <button v-if="temDigital && digitalSuportada()" type="button" class="block w-full text-center text-footnote text-accent" @click="usarSenha = !usarSenha">
          {{ usarSenha ? 'Usar a digital' : 'Usar a palavra-passe' }}
        </button>
        <p v-if="!temDigital" class="text-center text-footnote text-label-2">
          Para abrir com o Touch ID, ative a digital no cofre (ícone da digital na barra do cofre aberto).
        </p>
      </template>

      <!-- aberto, cadastro -->
      <template v-else-if="pedido.acao === 'cadastro'">
        <div class="rounded-celula bg-fill-2 p-3 text-subhead">
          <p class="font-semibold">{{ pedido.conta?.nome || pedido.conta?.email }}</p>
          <p class="text-label-2">{{ pedido.conta?.email }} · {{ pedido.app.nome }}</p>
        </div>
        <p v-if="jaGuardada" class="text-footnote text-label-2">Esta conta já tem uma entrada neste cofre. Guardar de novo cria outra.</p>
        <UiButton tamanho="large" bloco :carregando="ocupado" @click="guardar"><KeyIcon class="h-5 w-5" /> Guardar no cofre</UiButton>
      </template>

      <!-- aberto, entrar -->
      <template v-else>
        <template v-if="!entradas.length && itensDeLogin.length">
          <p class="rounded-celula bg-fill-2 p-3 text-subhead">
            Este cofre tem o login do {{ pedido.app.nome }}. O cofre entra com ele uma vez, guarda a chave de entrada e, das próximas
            vezes, só assina.
          </p>
          <UiButton v-for="i in itensDeLogin" :key="i.id" tamanho="large" bloco :carregando="ocupado" @click="entrarComItem(i)">
            <KeyIcon class="h-5 w-5" /> Entrar como {{ rotuloDoItem(i) }}
          </UiButton>
        </template>
        <p v-else-if="!entradas.length" class="rounded-celula bg-fill-2 p-3 text-subhead">
          Nenhuma entrada do {{ pedido.app.nome }} neste cofre. Guarde no cofre um item com o endereço, o e-mail, a senha e o 2FA do
          {{ pedido.app.nome }}, ou entre no aplicativo com e-mail e senha e use "Guardar a entrada no cofre do LoginHUB".
        </p>
        <UiButton v-for="i in entradas" :key="i.id" tamanho="large" bloco :carregando="ocupado" @click="entrar(i)">
          Entrar como {{ i.entrada?.conta }}
        </UiButton>
      </template>

      <p v-if="erro" role="alert" class="rounded-celula bg-danger/10 p-3 text-subhead text-danger">{{ erro }}</p>
      <button type="button" class="block w-full text-center text-footnote text-label-2" @click="voltar(pedido.acao === 'cadastro' ? '/' : '/entrar')">
        Cancelar e voltar ao {{ pedido.app.nome }}
      </button>
    </div>

    <template #rodape>Cofre do LoginHUB · cifrado neste navegador</template>
  </AuthShell>
</template>
