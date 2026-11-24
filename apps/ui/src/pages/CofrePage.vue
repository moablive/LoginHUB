<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import axios from 'axios';
import { useRoute } from 'vue-router';
import { appApi } from '@loginhub/api-client';
import type { CofreDigital } from '@loginhub/schema';
import {
  ArrowPathIcon,
  ChevronDownIcon,
  ClipboardDocumentIcon,
  CommandLineIcon,
  EyeIcon,
  EyeSlashIcon,
  FingerPrintIcon,
  KeyIcon,
  LockClosedIcon,
  LockOpenIcon,
  PencilSquareIcon,
  PlusIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  TrashIcon,
} from '@heroicons/vue/24/outline';
import UiNavBar from '@/components/ui/UiNavBar.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiTextField from '@/components/ui/UiTextField.vue';
import UiSearchField from '@/components/ui/UiSearchField.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import UiSheet from '@/components/ui/UiSheet.vue';
import UiAlert from '@/components/ui/UiAlert.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiSpinner from '@/components/ui/UiSpinner.vue';
import UiEmpty from '@/components/ui/UiEmpty.vue';
import CofreItemIcone, { type LogoDeApp } from '@/components/CofreItemIcone.vue';
import CofreAparelhos from '@/components/cofre/CofreAparelhos.vue';
import CofreFolha from '@/components/cofre/CofreFolha.vue';
import CofreLista from '@/components/cofre/CofreLista.vue';
import { estiloDoCofre, iconeDoCofre, type AparenciaCofre } from '@/features/cofre/aparencia';
import { useCofre, type ItemAberto, type ItemCofre } from '@/features/cofre/useCofre';
import { codigoTotp, gerarSenha, lerTotp, segundosRestantes } from '@/features/cofre/cripto';
import { digitalSuportada, ErroDigital } from '@/features/cofre/digital';

/**
 * Cofre de senhas (19/11/2026, db/013). Duas portas: a Master Key abre o painel
 * (como sempre) e a PALAVRA-PASSE abre o cofre. A palavra-passe nunca sai deste
 * navegador; o servidor só guarda texto cifrado.
 *
 * Digital (19/11/2026, db/015, pedido do dono): depois de cadastrada pelo botão
 * de digital da barra, o cofre trancado abre com Touch ID/Face ID (passkey com
 * PRF). A palavra-passe e o kit continuam valendo.
 */
const props = withDefaults(
  defineProps<{
    /** `painel` = master dentro do painel (com o voltar); `usuario` = /meu-cofre, de um usuário de app. */
    modo?: 'painel' | 'usuario';
  }>(),
  { modo: 'painel' },
);
const emit = defineEmits<{ sair: [] }>();

const cofre = useCofre();
const { existe, aberto, cofres, itens, ilegiveis, temDigital, digitais, digitalPendente } = cofre;

const carregando = ref(true);
const erro = ref<string | null>(null);
const ocupado = ref(false);

// --- criar / abrir
const palavra = ref('');
const confirmacao = ref('');
const usarKit = ref(false);
const kitDigitado = ref('');
const kitMostrado = ref<string | null>(null);
const kitGuardado = ref(false);
const pedirNovaSenha = ref(false);

const MENSAGEM_DIGITAL: Record<ErroDigital['codigo'], string> = {
  SEM_SUPORTE: 'Este navegador não tem passkey. Use a palavra-passe.',
  SEM_PRF: 'Este aparelho (ou o gerenciador de senhas dele) não devolve o segredo da digital (PRF). Use Senhas do iCloud ou do Google, ou a palavra-passe.',
  CANCELADO: '',
  NAO_RECONHECIDA: 'Digital não reconhecida.',
};
// A digital foi lida, mas não é a que abre este cofre: o aparelho não tem digital cadastrada, ou a que ele tem foi
// cadastrada com defeito (antes de 24/11/2026) ou tirada.
const DIGITAL_NAO_ABRE = 'Esta digital não abre o cofre neste aparelho. Abra com a palavra-passe, toque no ícone da digital, tire a digital deste aparelho (se estiver na lista) e ative de novo.';
const mensagemDe = (e: unknown, padrao: string): string => {
  if (e instanceof ErroDigital) return MENSAGEM_DIGITAL[e.codigo];
  if (e instanceof Error && e.message === 'DIGITAL_NAO_ABRE') return DIGITAL_NAO_ABRE;
  if (e instanceof Error && e.message === 'SEM_DIGITAL') return 'Nenhuma digital abre este cofre ainda.';
  if (e instanceof Error && e.message === 'CHAVE_ERRADA') return usarKit.value ? 'Kit de recuperação errado.' : 'Palavra-passe errada.';
  if (e instanceof Error && (e.message === 'KIT_INVALIDO' || e.message === 'BASE32_INVALIDO')) return 'Kit de recuperação incompleto ou com caractere errado.';
  if (axios.isAxiosError(e) && e.response?.data?.message) return String(e.response.data.message);
  return padrao;
};

// Logos dos aplicativos do hub, por host: o item cujo endereço é de um app mostra o logo dele (CofreItemIcone).
// Só o painel (master) lista os apps; no /meu-cofre a lista fica vazia e vale o favicon do site.
const logosDosApps = ref<LogoDeApp[]>([]);
async function carregarLogos() {
  if (props.modo !== 'painel') return;
  try {
    logosDosApps.value = (await appApi.getAll()).flatMap((a) => {
      if (!a.logo || !a.platform_url) return [];
      try {
        return [{ id: a.id, host: new URL(a.platform_url).hostname.toLowerCase(), logo: a.logo }];
      } catch {
        return [];
      }
    });
  } catch {
    /* sem a lista, os itens caem no favicon do site ou nas iniciais */
  }
}

onMounted(async () => {
  void carregarLogos();
  try {
    await cofre.carregar();
  } catch (e) {
    erro.value = mensagemDe(e, 'Não foi possível carregar o cofre.');
  } finally {
    carregando.value = false;
  }
});

const senhaFraca = computed(() => palavra.value.length > 0 && palavra.value.length < 12);

async function criar() {
  if (palavra.value.length < 12) return void (erro.value = 'Use pelo menos 12 caracteres (melhor: 4 a 6 palavras soltas).');
  if (palavra.value !== confirmacao.value) return void (erro.value = 'As duas palavras-passe não são iguais.');
  ocupado.value = true;
  erro.value = null;
  try {
    kitMostrado.value = await cofre.criar(palavra.value);
    palavra.value = '';
    confirmacao.value = '';
  } catch (e) {
    erro.value = mensagemDe(e, 'Não foi possível criar o cofre.');
  } finally {
    ocupado.value = false;
  }
}

async function abrir() {
  ocupado.value = true;
  erro.value = null;
  try {
    if (usarKit.value) {
      await cofre.abrirComKit(kitDigitado.value);
      kitDigitado.value = '';
      pedirNovaSenha.value = true;
    } else {
      await cofre.abrirComSenha(palavra.value);
    }
    palavra.value = '';
  } catch (e) {
    erro.value = mensagemDe(e, 'Não foi possível abrir o cofre.');
  } finally {
    ocupado.value = false;
  }
}

const podeDigital = computed(() => temDigital.value && digitalSuportada());
async function abrirDigital() {
  ocupado.value = true;
  erro.value = null;
  try {
    await cofre.abrirComDigital();
  } catch (e) {
    // Leitor fechado ou digital não achada: aqui o silêncio parecia botão morto.
    erro.value = mensagemDe(e, 'Não foi possível abrir pela digital.') || 'A digital não abriu o cofre: o leitor foi fechado ou este aparelho não achou a digital. Tente de novo ou use a palavra-passe.';
  } finally {
    ocupado.value = false;
  }
}

// --- digitais que abrem o cofre (passkey com PRF, db/015)
const mostrarDigitais = ref(false);
const nomeDigital = ref('');
const digitalParaTirar = ref<CofreDigital | null>(null);
const avisoDigital = ref<string | null>(null);
function nomeDoAparelho(): string {
  const ua = navigator.userAgent;
  const toque = navigator.maxTouchPoints > 1;
  const sistema = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (/Macintosh/.test(ua) && toque) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Aparelho';
  const nav = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'navegador';
  return `${sistema} · ${nav}`;
}
async function abrirDigitais() {
  mostrarDigitais.value = true;
  avisoDigital.value = null;
  nomeDigital.value = nomeDoAparelho();
  try {
    await cofre.listarDigitais();
  } catch (e) {
    erro.value = mensagemDe(e, 'Não foi possível listar as digitais.');
  }
}
async function ativarDigital() {
  ocupado.value = true;
  erro.value = null;
  avisoDigital.value = null;
  try {
    await cofre.ativarDigital(nomeDigital.value);
    avisoDigital.value = 'Pronto: da próxima vez, o cofre trancado abre com a digital neste aparelho.';
  } catch (e) {
    // A passkey foi criada e falta só a leitura: o botão "Confirmar a digital" aparece no lugar do erro.
    erro.value = digitalPendente.value ? null : mensagemDe(e, 'Não foi possível cadastrar a digital.') || null;
  } finally {
    ocupado.value = false;
  }
}
// No template `cofre` é o objeto do composable, sem o desempacotamento dos refs: a chamada fica aqui.
function desistirDaDigital() {
  cofre.descartarDigitalPendente();
}
async function confirmarDigital() {
  ocupado.value = true;
  erro.value = null;
  try {
    await cofre.concluirDigital();
    avisoDigital.value = 'Pronto: da próxima vez, o cofre trancado abre com a digital neste aparelho.';
  } catch (e) {
    erro.value = mensagemDe(e, 'Não foi possível confirmar a digital.') || 'A digital não foi lida. Toque em Confirmar a digital de novo.';
  } finally {
    ocupado.value = false;
  }
}
async function tirarDigital() {
  const alvo = digitalParaTirar.value;
  if (!alvo) return;
  ocupado.value = true;
  try {
    await cofre.revogarDigital(alvo.id);
  } catch (e) {
    erro.value = mensagemDe(e, 'Não foi possível tirar a digital.');
  } finally {
    ocupado.value = false;
    digitalParaTirar.value = null;
  }
}

async function definirNovaSenha() {
  if (palavra.value.length < 12) return void (erro.value = 'Use pelo menos 12 caracteres.');
  if (palavra.value !== confirmacao.value) return void (erro.value = 'As duas palavras-passe não são iguais.');
  ocupado.value = true;
  erro.value = null;
  try {
    await cofre.trocarSenha(palavra.value);
    palavra.value = '';
    confirmacao.value = '';
    pedirNovaSenha.value = false;
  } catch (e) {
    erro.value = mensagemDe(e, 'Não foi possível trocar a palavra-passe.');
  } finally {
    ocupado.value = false;
  }
}

function trancar() {
  cofre.trancar();
  revelados.value = new Set();
}

// --- máquinas do CLI hub-pass (db/014 e db/017): a folha é o CofreAparelhos. O link `?aprovar=<código>` do
// `hub-pass login` abre a folha com o código assim que o cofre abrir.
const route = useRoute();
const codigoParaAprovar = typeof route.query.aprovar === 'string' ? route.query.aprovar : '';
const mostrarAparelhos = ref(false);
watch(
  aberto,
  (abriu) => {
    if (abriu && codigoParaAprovar && !pedirNovaSenha.value) mostrarAparelhos.value = true;
  },
  { immediate: true },
);
const dataHora = (d: string | Date | null) =>
  d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

// --- tranca sozinho: 5 minutos sem mexer, ou a aba some por 5 minutos
const OCIOSO_MS = 5 * 60 * 1000;
let ultimoUso = Date.now();
const marcarUso = () => (ultimoUso = Date.now());
let relogio: ReturnType<typeof setInterval> | undefined;
const agora = ref(Date.now());
onMounted(() => {
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, marcarUso);
  relogio = setInterval(() => {
    agora.value = Date.now();
    if (aberto.value && Date.now() - ultimoUso > OCIOSO_MS) trancar();
  }, 1000);
});
onBeforeUnmount(() => {
  for (const ev of ['pointerdown', 'keydown']) window.removeEventListener(ev, marcarUso);
  clearInterval(relogio);
  // Sair da tela tranca: as chaves não ficam vivas no resto do painel.
  trancar();
});

// --- lista. `cofreAtual` nulo = "Todos os itens" (como o Proton Pass abre).
const cofreAtual = ref<string | null>(null);
watch(cofres, (lista) => {
  if (cofreAtual.value && !lista.find((c) => c.id === cofreAtual.value)) cofreAtual.value = null;
});
const busca = ref('');
const visiveis = computed(() => {
  const termo = busca.value.trim().toLowerCase();
  return itens.value.filter(
    (i) =>
      (termo || cofreAtual.value === null ? true : i.cofre_id === cofreAtual.value) &&
      (!termo || i.titulo.toLowerCase().includes(termo) || i.usuario.toLowerCase().includes(termo) || i.url.toLowerCase().includes(termo)),
  );
});
const nomeDoCofre = (id: string) => cofres.value.find((c) => c.id === id)?.nome ?? '';
const contagem = computed(() => {
  const n: Record<string, number> = {};
  for (const i of itens.value) n[i.cofre_id] = (n[i.cofre_id] ?? 0) + 1;
  return n;
});
const cofreEscolhido = computed(() => cofres.value.find((c) => c.id === cofreAtual.value) ?? null);
const quantos = (n: number) => (n === 1 ? '1 item' : `${n} itens`);
// No celular a lista dos cofres vem numa folha, aberta pelo botão do cofre atual.
const mostrarCofres = ref(false);
function escolherCofre(id: string | null) {
  cofreAtual.value = id;
  mostrarCofres.value = false;
}

const revelados = ref(new Set<string>());
function alternarRevelar(id: string) {
  const s = new Set(revelados.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  revelados.value = s;
}

const copiado = ref<string | null>(null);
let limparCopia: ReturnType<typeof setTimeout> | undefined;
async function copiar(valor: string, chave: string) {
  try {
    await navigator.clipboard.writeText(valor);
    copiado.value = chave;
    clearTimeout(limparCopia);
    // Some da área de transferência em 30 s (quando o navegador deixa).
    limparCopia = setTimeout(() => {
      copiado.value = null;
      void navigator.clipboard.writeText('').catch(() => undefined);
    }, 30000);
  } catch {
    erro.value = 'O navegador não deixou copiar.';
  }
}

function codigoDe(item: ItemAberto): { codigo: string; resta: number } | null {
  const t = lerTotp(item.totp);
  if (!t) return null;
  return { codigo: codigoTotp(t, agora.value), resta: segundosRestantes(t, agora.value) };
}

// --- editar item
const VAZIO: ItemCofre = { titulo: '', usuario: '', senha: '', url: '', totp: '', notas: '' };
// Qual item a folha edita (null = fechada) e o formulário dela, separados para
// o formulário nunca ser nulo no template.
const editando = ref<{ id?: string; cofreId: string } | null>(null);
const form = ref<ItemCofre>({ ...VAZIO });
const verSenhaEdicao = ref(false);
const totpInvalido = computed(() => !!form.value.totp.trim() && !lerTotp(form.value.totp));

function novoItem() {
  // Em "Todos os itens" o item nasce no primeiro cofre; a folha deixa trocar.
  const cofreId = cofreAtual.value ?? cofres.value[0]?.id;
  if (!cofreId) return;
  verSenhaEdicao.value = false;
  form.value = { ...VAZIO };
  editando.value = { cofreId };
}
function editarItem(item: ItemAberto) {
  verSenhaEdicao.value = false;
  // `entrada` (chave de entrada pelo cofre, db/016) vai junto: o formulário não mostra, mas salvar não pode perdê-la.
  const { titulo, usuario, senha, url, totp, notas, entrada } = item;
  form.value = { titulo, usuario, senha, url, totp, notas, ...(entrada ? { entrada } : {}) };
  editando.value = { id: item.id, cofreId: item.cofre_id };
}
function gerarNaEdicao() {
  form.value.senha = gerarSenha();
  verSenhaEdicao.value = true;
}
async function salvarItem() {
  const e = editando.value;
  if (!e || !form.value.titulo.trim() || totpInvalido.value) return;
  ocupado.value = true;
  erro.value = null;
  try {
    await cofre.salvarItem(e.cofreId, { ...form.value, titulo: form.value.titulo.trim() }, e.id);
    editando.value = null;
  } catch (err) {
    erro.value = mensagemDe(err, 'Não foi possível salvar.');
  } finally {
    ocupado.value = false;
  }
}
const itemParaApagar = ref<ItemAberto | null>(null);
async function apagarItem() {
  const alvo = itemParaApagar.value;
  if (!alvo) return;
  ocupado.value = true;
  try {
    await cofre.apagarItem(alvo.id);
  } catch (err) {
    erro.value = mensagemDe(err, 'Não foi possível apagar.');
  } finally {
    ocupado.value = false;
    itemParaApagar.value = null;
  }
}

// --- cofres: criar, editar (nome, cor, ícone) e apagar, pela lista (CofreLista) e pela folha (CofreFolha)
const editandoCofre = ref<{ id?: string; nome: string; icone?: string; cor?: string } | null>(null);
function novoCofre() {
  mostrarCofres.value = false;
  editandoCofre.value = { nome: '' };
}
function editarCofre(id: string) {
  const c = cofres.value.find((x) => x.id === id);
  if (!c) return;
  mostrarCofres.value = false;
  editandoCofre.value = { id: c.id, nome: c.nome, icone: c.icone, cor: c.cor };
}
function pedirApagarCofre(id: string) {
  mostrarCofres.value = false;
  cofreParaApagar.value = { id, nome: nomeDoCofre(id) };
}
async function salvarCofre(dados: { nome: string } & AparenciaCofre) {
  const e = editandoCofre.value;
  if (!e) return;
  ocupado.value = true;
  erro.value = null;
  try {
    const id = await cofre.salvarCofre(dados.nome, e.id, { icone: dados.icone, cor: dados.cor });
    // Cofre novo já abre escolhido, pronto para receber itens.
    if (!e.id) cofreAtual.value = id;
    editandoCofre.value = null;
  } catch (err) {
    erro.value = mensagemDe(err, 'Não foi possível salvar o cofre.');
  } finally {
    ocupado.value = false;
  }
}
async function reordenarCofres(ids: string[]) {
  ocupado.value = true;
  erro.value = null;
  try {
    await cofre.reordenarCofres(ids);
  } catch (err) {
    erro.value = mensagemDe(err, 'Não foi possível gravar a ordem dos cofres.');
  } finally {
    ocupado.value = false;
  }
}
const cofreParaApagar = ref<{ id: string; nome: string } | null>(null);
async function apagarCofre() {
  const alvo = cofreParaApagar.value;
  if (!alvo) return;
  ocupado.value = true;
  try {
    await cofre.apagarCofre(alvo.id);
  } catch (err) {
    erro.value = mensagemDe(err, 'Não foi possível apagar o cofre.');
  } finally {
    ocupado.value = false;
    cofreParaApagar.value = null;
  }
}

const trocandoSenha = ref(false);
function abrirTrocaSenha() {
  palavra.value = '';
  confirmacao.value = '';
  erro.value = null;
  trocandoSenha.value = true;
}
async function confirmarTrocaSenha() {
  await definirNovaSenha();
  if (!erro.value) trocandoSenha.value = false;
}
</script>

<template>
  <div class="animate-fade-in">
    <UiNavBar titulo="Cofre de senhas" :voltar="props.modo === 'painel' ? '/dashboard' : undefined" voltar-texto="Aplicativos">
      <template #subtitulo>Cifrado no seu navegador · o servidor só guarda o que ninguém lê</template>
      <template #acoes>
        <template v-if="aberto">
          <UiButton variante="plain" icone aria-label="Digitais" title="Abrir o cofre com a digital (Touch ID, Face ID)" @click="abrirDigitais">
            <FingerPrintIcon class="h-6 w-6" />
          </UiButton>
          <UiButton variante="plain" icone aria-label="Aparelhos do CLI" title="Máquinas aprovadas do CLI hub-pass" @click="mostrarAparelhos = true">
            <CommandLineIcon class="h-6 w-6" />
          </UiButton>
          <UiButton variante="plain" icone aria-label="Trocar palavra-passe" title="Trocar a palavra-passe" @click="abrirTrocaSenha">
            <KeyIcon class="h-6 w-6" />
          </UiButton>
          <UiButton tamanho="small" variante="gray" @click="trancar">
            <LockClosedIcon class="h-4 w-4" />
            Trancar
          </UiButton>
        </template>
        <UiButton v-if="props.modo === 'usuario'" variante="plain" tamanho="small" @click="emit('sair')">Sair</UiButton>
      </template>
    </UiNavBar>

    <div v-if="carregando" class="flex justify-center py-16 text-label-2"><UiSpinner class="h-8 w-8" /></div>

    <!-- KIT DE RECUPERAÇÃO: aparece uma vez, logo depois de criar -->
    <div v-else-if="kitMostrado" class="mx-auto mt-6 max-w-lg space-y-4 rounded-celula bg-surface p-6">
      <div class="flex items-center gap-2">
        <ShieldCheckIcon class="h-7 w-7 text-success" />
        <h2 class="text-title-3 font-semibold">Cofre criado. Guarde o kit de recuperação.</h2>
      </div>
      <p class="text-subhead text-label-2">
        É a única outra forma de abrir o cofre se você esquecer a palavra-passe. Imprima ou escreva em papel e guarde longe
        do computador. <strong class="text-danger">Ele não aparece de novo e ninguém (nem o servidor) consegue recuperá-lo.</strong>
      </p>
      <p class="select-all break-all rounded-lg bg-fill-2 p-4 text-center font-mono text-headline tracking-wider">{{ kitMostrado }}</p>
      <UiButton variante="tinted" bloco @click="copiar(kitMostrado, 'kit')">
        <ClipboardDocumentIcon class="h-5 w-5" />{{ copiado === 'kit' ? 'Copiado' : 'Copiar o kit' }}
      </UiButton>
      <label class="flex items-center gap-2 text-subhead">
        <input v-model="kitGuardado" type="checkbox" class="h-5 w-5" />
        Já guardei o kit fora do computador.
      </label>
      <UiButton tamanho="large" bloco :disabled="!kitGuardado" @click="kitMostrado = null">Abrir o cofre</UiButton>
    </div>

    <!-- CRIAR -->
    <div v-else-if="!existe" class="mx-auto mt-6 max-w-lg space-y-4 rounded-celula bg-surface p-6">
      <div class="flex items-center gap-2">
        <LockClosedIcon class="h-7 w-7 text-accent" />
        <h2 class="text-title-3 font-semibold">Criar o seu cofre</h2>
      </div>
      <p class="text-subhead text-label-2">
        Escolha uma <strong>palavra-passe</strong> só sua, diferente da Master Key. Ela cifra o cofre aqui no navegador e nunca vai
        para o servidor. Dica: 4 a 6 palavras soltas que só você liga (ex.: <em>cavalo-azul-pavilhão-chuva</em>).
      </p>
      <form class="space-y-3" @submit.prevent="criar">
        <UiTextField v-model="palavra" rotulo="Palavra-passe" type="password" revelar autocomplete="new-password" required :erro="senhaFraca ? 'Pelo menos 12 caracteres.' : null" />
        <UiTextField v-model="confirmacao" rotulo="Repita a palavra-passe" type="password" revelar autocomplete="new-password" required />
        <p v-if="erro" role="alert" class="rounded-celula bg-danger/10 p-3 text-subhead text-danger">{{ erro }}</p>
        <UiButton type="submit" tamanho="large" bloco :carregando="ocupado" :disabled="!palavra || !confirmacao">
          {{ ocupado ? 'Criando (alguns segundos)…' : 'Criar cofre' }}
        </UiButton>
      </form>
    </div>

    <!-- PALAVRA-PASSE NOVA depois do kit -->
    <div v-else-if="aberto && pedirNovaSenha" class="mx-auto mt-6 max-w-lg space-y-4 rounded-celula bg-surface p-6">
      <h2 class="text-title-3 font-semibold">Cofre aberto pelo kit. Escolha uma palavra-passe nova.</h2>
      <form class="space-y-3" @submit.prevent="definirNovaSenha">
        <UiTextField v-model="palavra" rotulo="Palavra-passe nova" type="password" revelar autocomplete="new-password" required />
        <UiTextField v-model="confirmacao" rotulo="Repita" type="password" revelar autocomplete="new-password" required />
        <p v-if="erro" role="alert" class="rounded-celula bg-danger/10 p-3 text-subhead text-danger">{{ erro }}</p>
        <UiButton type="submit" tamanho="large" bloco :carregando="ocupado">Salvar palavra-passe</UiButton>
      </form>
    </div>

    <!-- TRANCADO -->
    <div v-else-if="!aberto" class="mx-auto mt-6 max-w-lg space-y-4 rounded-celula bg-surface p-6">
      <div class="flex items-center gap-2">
        <LockClosedIcon class="h-7 w-7 text-accent" />
        <h2 class="text-title-3 font-semibold">Cofre trancado</h2>
      </div>
      <template v-if="podeDigital && !usarKit">
        <UiButton tamanho="large" bloco :carregando="ocupado" @click="abrirDigital">
          <FingerPrintIcon class="h-5 w-5" />{{ ocupado ? 'Abrindo…' : 'Abrir com a digital' }}
        </UiButton>
        <p class="text-center text-footnote text-label-2">ou com a palavra-passe</p>
      </template>
      <form class="space-y-3" @submit.prevent="abrir">
        <UiTextField v-if="!usarKit" v-model="palavra" rotulo="Palavra-passe" type="password" revelar autocomplete="current-password" required />
        <UiTextField v-else v-model="kitDigitado" rotulo="Kit de recuperação" placeholder="XXXX-XXXX-…" autocomplete="off" required />
        <p v-if="erro" role="alert" class="rounded-celula bg-danger/10 p-3 text-subhead text-danger">{{ erro }}</p>
        <UiButton type="submit" tamanho="large" bloco :carregando="ocupado" :disabled="usarKit ? !kitDigitado : !palavra">
          <LockOpenIcon class="h-5 w-5" />{{ ocupado ? 'Abrindo…' : 'Abrir' }}
        </UiButton>
        <UiButton variante="plain" tamanho="small" @click="(usarKit = !usarKit), (erro = null)">
          {{ usarKit ? 'Usar a palavra-passe' : 'Esqueci a palavra-passe (usar o kit de recuperação)' }}
        </UiButton>
      </form>
    </div>

    <!-- ABERTO -->
    <div v-else class="mt-4 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      <!-- cofres: coluna no computador; no celular, a folha aberta pelo botão do cofre atual -->
      <aside class="hidden lg:sticky lg:top-4 lg:block">
        <CofreLista :cofres="cofres" :contagem="contagem" :total="itens.length" :atual="cofreAtual" :ocupado="ocupado" @escolher="escolherCofre" @novo="novoCofre" @editar="editarCofre" @apagar="pedirApagarCofre" @reordenar="reordenarCofres" />
      </aside>

      <div class="space-y-4">
        <p v-if="ilegiveis > 0" class="rounded-celula bg-warning/10 p-3 text-subhead text-warning">
          {{ ilegiveis }} registro(s) não abriram: foram alterados fora do cofre ou estão corrompidos.
        </p>
        <p v-if="erro" role="alert" class="rounded-celula bg-danger/10 p-3 text-subhead text-danger">{{ erro }}</p>

        <button type="button" class="flex w-full items-center gap-3 rounded-celula bg-surface p-2 text-left lg:hidden" aria-haspopup="dialog" @click="mostrarCofres = true">
          <span v-if="cofreEscolhido" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" :style="estiloDoCofre(cofreEscolhido.cor)" aria-hidden="true">
            <component :is="iconeDoCofre(cofreEscolhido.icone)" class="h-5 w-5" />
          </span>
          <span v-else class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent" aria-hidden="true">
            <Squares2X2Icon class="h-5 w-5" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-headline font-semibold">{{ cofreEscolhido?.nome ?? 'Todos os itens' }}</span>
            <span class="block text-footnote text-label-2">{{ quantos(cofreEscolhido ? (contagem[cofreEscolhido.id] ?? 0) : itens.length) }} · trocar de cofre</span>
          </span>
          <ChevronDownIcon class="mr-2 h-5 w-5 shrink-0 text-label-2" />
        </button>

        <div class="flex items-center gap-2">
          <UiSearchField v-model="busca" placeholder="Buscar em todos os cofres" />
          <UiButton tamanho="small" :disabled="cofres.length === 0" @click="novoItem"><PlusIcon class="h-4 w-4" />Item</UiButton>
        </div>

        <UiEmpty
          v-if="visiveis.length === 0"
          :icone="KeyIcon"
          :titulo="busca ? 'Nada encontrado.' : cofres.length === 0 ? 'Nenhum cofre ainda.' : 'Cofre vazio.'"
          :texto="busca ? undefined : cofres.length === 0 ? 'Crie um cofre pelo + da lista de cofres.' : 'Guarde aqui senhas e códigos 2FA.'"
        />

        <ul v-else class="space-y-2">
          <li v-for="item in visiveis" :key="item.id" class="rounded-celula bg-surface p-4">
            <div class="flex items-start gap-3">
              <CofreItemIcone :titulo="item.titulo" :url="item.url" :apps="logosDosApps" />
              <div class="min-w-0 flex-1 space-y-1">
                <p class="flex flex-wrap items-center gap-2 text-headline font-semibold">
                  <span class="truncate">{{ item.titulo }}</span>
                  <UiBadge v-if="busca || cofreAtual === null">{{ nomeDoCofre(item.cofre_id) }}</UiBadge>
                  <UiBadge v-if="item.entrada" title="Chave de entrada pelo cofre (db/016): o app entra com ela">entrada pelo cofre</UiBadge>
                </p>
                <a v-if="item.url" :href="/^https?:\/\//i.test(item.url) ? item.url : undefined" target="_blank" rel="noopener noreferrer" class="block truncate text-footnote text-accent">{{ item.url }}</a>

                <div v-if="item.usuario" class="flex items-center gap-2 text-subhead">
                  <span class="w-16 shrink-0 text-label-2">Usuário</span>
                  <span class="truncate font-mono">{{ item.usuario }}</span>
                  <button type="button" class="text-accent" :title="'Copiar usuário'" @click="copiar(item.usuario, item.id + ':u')">
                    <ClipboardDocumentIcon class="h-4 w-4" />
                  </button>
                  <span v-if="copiado === item.id + ':u'" class="text-caption-1 text-success">copiado</span>
                </div>

                <div v-if="item.senha" class="flex items-center gap-2 text-subhead">
                  <span class="w-16 shrink-0 text-label-2">Senha</span>
                  <span class="truncate font-mono">{{ revelados.has(item.id) ? item.senha : '••••••••••' }}</span>
                  <button type="button" class="text-label-2" :title="revelados.has(item.id) ? 'Esconder' : 'Mostrar'" @click="alternarRevelar(item.id)">
                    <EyeSlashIcon v-if="revelados.has(item.id)" class="h-4 w-4" /><EyeIcon v-else class="h-4 w-4" />
                  </button>
                  <button type="button" class="text-accent" title="Copiar senha" @click="copiar(item.senha, item.id + ':s')">
                    <ClipboardDocumentIcon class="h-4 w-4" />
                  </button>
                  <span v-if="copiado === item.id + ':s'" class="text-caption-1 text-success">copiada (some em 30 s)</span>
                </div>

                <div v-if="codigoDe(item)" class="flex items-center gap-2 text-subhead">
                  <span class="w-16 shrink-0 text-label-2">2FA</span>
                  <span class="font-mono text-title-3 tracking-widest text-accent">{{ codigoDe(item)!.codigo }}</span>
                  <span class="text-caption-1 text-label-2">{{ codigoDe(item)!.resta }}s</span>
                  <button type="button" class="text-accent" title="Copiar código" @click="copiar(codigoDe(item)!.codigo, item.id + ':t')">
                    <ClipboardDocumentIcon class="h-4 w-4" />
                  </button>
                  <span v-if="copiado === item.id + ':t'" class="text-caption-1 text-success">copiado</span>
                </div>

                <p v-if="item.notas" class="whitespace-pre-wrap text-footnote text-label-2">{{ item.notas }}</p>
              </div>
              <div class="flex shrink-0 flex-col gap-1">
                <UiButton variante="plain" icone :aria-label="`Editar ${item.titulo}`" @click="editarItem(item)"><PencilSquareIcon class="h-5 w-5" /></UiButton>
                <UiButton variante="plain" icone class="!text-danger hover:!bg-danger/10" :aria-label="`Apagar ${item.titulo}`" @click="itemParaApagar = item">
                  <TrashIcon class="h-5 w-5" />
                </UiButton>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <!-- FOLHA: cofres (celular) -->
    <UiSheet :aberto="mostrarCofres" titulo="Trocar de cofre" largura="sm" @fechar="mostrarCofres = false">
      <CofreLista :cofres="cofres" :contagem="contagem" :total="itens.length" :atual="cofreAtual" :ocupado="ocupado" @escolher="escolherCofre" @novo="novoCofre" @editar="editarCofre" @apagar="pedirApagarCofre" @reordenar="reordenarCofres" />
    </UiSheet>

    <!-- FOLHA: item -->
    <UiSheet :aberto="!!editando" :titulo="editando?.id ? 'Editar item' : 'Novo item'" :subtitulo="editando ? nomeDoCofre(editando.cofreId) : ''" :bloqueado="ocupado" @fechar="editando = null">
      <form v-if="editando" id="form-item" class="space-y-3" @submit.prevent="salvarItem">
        <!-- Trocar o cofre de um item que já existe move o item: ele é recifrado com a chave do cofre novo. -->
        <UiSelect v-if="cofres.length > 1" v-model="editando.cofreId" rotulo="Cofre" :opcoes="cofres.map((c) => ({ valor: c.id, rotulo: c.nome }))" />
        <UiTextField v-model="form.titulo" rotulo="Título" placeholder="Ex.: GitHub, Cloudflare, awlsrv sudo" required />
        <UiTextField v-model="form.usuario" rotulo="Usuário / e-mail" autocomplete="off" />
        <div class="space-y-1">
          <UiTextField v-model="form.senha" rotulo="Senha" :type="verSenhaEdicao ? 'text' : 'password'" autocomplete="new-password" />
          <div class="flex gap-2">
            <UiButton variante="plain" tamanho="small" @click="verSenhaEdicao = !verSenhaEdicao">{{ verSenhaEdicao ? 'Esconder' : 'Mostrar' }}</UiButton>
            <UiButton variante="plain" tamanho="small" @click="gerarNaEdicao">
              <ArrowPathIcon class="h-4 w-4" />Gerar senha forte
            </UiButton>
          </div>
        </div>
        <UiTextField v-model="form.url" rotulo="Endereço (URL)" placeholder="https://…" autocomplete="off" />
        <UiTextField
          v-model="form.totp"
          rotulo="Chave do 2FA (opcional)"
          placeholder="JBSW Y3DP… ou otpauth://totp/…"
          autocomplete="off"
          dica="A chave que o site mostra ao ativar o 2FA (texto embaixo do QR). O cofre passa a mostrar o código de 6 dígitos."
          :erro="totpInvalido ? 'Chave de 2FA inválida.' : null"
        />
        <label class="block text-footnote text-label-2">
          Notas
          <textarea v-model="form.notas" rows="3" class="mt-1 w-full rounded-lg bg-fill-2 p-3 text-body text-label outline-none focus:ring-2 focus:ring-accent/40" />
        </label>
      </form>
      <template #acoes>
        <UiButton variante="gray" @click="editando = null">Cancelar</UiButton>
        <UiButton type="submit" form="form-item" :carregando="ocupado" :disabled="!form.titulo.trim() || totpInvalido">Salvar</UiButton>
      </template>
    </UiSheet>

    <!-- FOLHA: cofre (nome, cor e ícone) -->
    <CofreFolha :cofre="editandoCofre" :ocupado="ocupado" @fechar="editandoCofre = null" @salvar="salvarCofre" />

    <!-- FOLHA: trocar palavra-passe -->
    <UiSheet :aberto="trocandoSenha" titulo="Trocar a palavra-passe" largura="sm" :bloqueado="ocupado" @fechar="trocandoSenha = false">
      <form id="form-senha" class="space-y-3" @submit.prevent="confirmarTrocaSenha">
        <p class="text-subhead text-label-2">O kit de recuperação continua o mesmo. Cofres e itens não mudam.</p>
        <UiTextField v-model="palavra" rotulo="Palavra-passe nova" type="password" revelar autocomplete="new-password" required />
        <UiTextField v-model="confirmacao" rotulo="Repita" type="password" revelar autocomplete="new-password" required />
        <p v-if="erro" role="alert" class="rounded-celula bg-danger/10 p-3 text-subhead text-danger">{{ erro }}</p>
      </form>
      <template #acoes>
        <UiButton variante="gray" @click="trocandoSenha = false">Cancelar</UiButton>
        <UiButton type="submit" form="form-senha" :carregando="ocupado">Salvar</UiButton>
      </template>
    </UiSheet>

    <!-- FOLHA: digitais que abrem o cofre (passkey com PRF, db/015) -->
    <UiSheet :aberto="mostrarDigitais" titulo="Digital" subtitulo="Abrir o cofre com Touch ID, Face ID ou digital" largura="md" :bloqueado="ocupado" @fechar="mostrarDigitais = false">
      <div class="space-y-4">
        <div class="rounded-celula bg-fill-2 p-3 text-footnote text-label-2">
          Cada aparelho cadastra a própria digital. O segredo dela fica no aparelho (Senhas do iCloud ou do Google) e nunca
          vai ao servidor; a palavra-passe e o kit de recuperação continuam abrindo o cofre.
        </div>
        <p v-if="!digitalSuportada()" class="rounded-celula bg-warning/10 p-3 text-subhead text-warning">Este navegador não tem passkey.</p>
        <div v-else-if="digitalPendente" class="space-y-3 rounded-celula bg-warning/10 p-3">
          <p class="text-subhead text-label">A digital foi criada neste aparelho. Falta confirmar: toque no botão e passe a digital mais uma vez.</p>
          <UiButton tamanho="large" bloco :carregando="ocupado" @click="confirmarDigital">
            <FingerPrintIcon class="h-5 w-5" />Confirmar a digital
          </UiButton>
          <UiButton variante="plain" tamanho="small" :disabled="ocupado" @click="desistirDaDigital">Desistir</UiButton>
        </div>
        <form v-else class="space-y-3" @submit.prevent="ativarDigital">
          <UiTextField v-model="nomeDigital" rotulo="Nome deste aparelho" maxlength="120" required />
          <UiButton type="submit" tamanho="large" bloco :carregando="ocupado">
            <FingerPrintIcon class="h-5 w-5" />Ativar a digital neste aparelho
          </UiButton>
        </form>
        <p v-if="avisoDigital" class="rounded-celula bg-success/10 p-3 text-subhead text-success">{{ avisoDigital }}</p>
        <p v-if="erro && mostrarDigitais" role="alert" class="rounded-celula bg-danger/10 p-3 text-subhead text-danger">{{ erro }}</p>
        <p v-if="digitais.length === 0" class="py-3 text-subhead italic text-label-2">Nenhuma digital abre o cofre ainda.</p>
        <ul v-else class="divide-y rounded-celula bg-surface [&>*]:border-separator">
          <li v-for="d in digitais" :key="d.id" class="flex items-center gap-3 px-3 py-3">
            <FingerPrintIcon class="h-6 w-6 shrink-0 text-accent" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-subhead font-semibold">{{ d.nome }}</p>
              <p class="text-caption-1 text-label-2">cadastrada {{ dataHora(d.criado_em) }} · último uso {{ dataHora(d.ultimo_uso) }}</p>
            </div>
            <UiButton variante="destructive-tinted" tamanho="small" @click="digitalParaTirar = d">Tirar</UiButton>
          </li>
        </ul>
      </div>
    </UiSheet>

    <UiAlert
      :aberto="!!digitalParaTirar"
      tom="danger"
      titulo="Tirar esta digital?"
      :destaque="digitalParaTirar?.nome"
      confirmar="Tirar"
      :carregando="ocupado"
      @fechar="digitalParaTirar = null"
      @confirmar="tirarDigital"
    >
      Este aparelho deixa de abrir o cofre com a digital. A palavra-passe continua valendo.
    </UiAlert>

    <!-- FOLHA: aparelhos do CLI (lista, revoga e aprova máquina nova pelo código do hub-pass login) -->
    <CofreAparelhos :aberto="mostrarAparelhos" :codigo-inicial="codigoParaAprovar" @fechar="mostrarAparelhos = false" />

    <UiAlert
      :aberto="!!itemParaApagar"
      tom="danger"
      :icone="TrashIcon"
      titulo="Apagar este item?"
      :destaque="itemParaApagar?.titulo"
      confirmar="Apagar"
      :carregando="ocupado"
      @fechar="itemParaApagar = null"
      @confirmar="apagarItem"
    >
      Some do cofre para sempre.
    </UiAlert>

    <UiAlert
      :aberto="!!cofreParaApagar"
      tom="danger"
      :icone="TrashIcon"
      titulo="Apagar o cofre inteiro?"
      :destaque="cofreParaApagar?.nome"
      confirmar="Apagar tudo"
      :carregando="ocupado"
      @fechar="cofreParaApagar = null"
      @confirmar="apagarCofre"
    >
      O cofre e <strong class="text-danger">todos os itens dele</strong> somem para sempre.
    </UiAlert>
  </div>
</template>
