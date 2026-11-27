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
  EllipsisHorizontalCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  FingerPrintIcon,
  KeyIcon,
  LockClosedIcon,
  LockOpenIcon,
  PencilSquareIcon,
  PhotoIcon,
  XMarkIcon,
  PlusIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  TrashIcon,
  UserPlusIcon,
} from '@heroicons/vue/24/outline';
import UiNavBar from '@/components/ui/UiNavBar.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiTextField from '@/components/ui/UiTextField.vue';
import UiSearchField from '@/components/ui/UiSearchField.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import UiSheet from '@/components/ui/UiSheet.vue';
import UiRow from '@/components/ui/UiRow.vue';
import UiAlert from '@/components/ui/UiAlert.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiSpinner from '@/components/ui/UiSpinner.vue';
import UiEmpty from '@/components/ui/UiEmpty.vue';
import CofreItemIcone, { type LogoDeApp } from '@/components/CofreItemIcone.vue';
import CofreAparelhos from '@/components/cofre/CofreAparelhos.vue';
import CofreCompartilhar from '@/components/cofre/CofreCompartilhar.vue';
import CofreFolha from '@/components/cofre/CofreFolha.vue';
import CofreLista from '@/components/cofre/CofreLista.vue';
import CofreIcone from '@/components/cofre/CofreIcone.vue';
import type { AparenciaCofre } from '@/features/cofre/aparencia';
import { TEMPOS_TRANCA_MIN, useCofre, type ItemAberto, type ItemCofre } from '@/features/cofre/useCofre';
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
const { existe, aberto, cofres, compartilhados, naoVerificados, itens, ilegiveis, temDigital, digitais, digitalPendente, offline, copiaEm, sincronizando } = cofre;

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
  if (e instanceof Error && e.message === 'OFFLINE_SEM_SENHA') return 'Sem internet: abra o cofre pela digital (Face ID). A palavra-passe só funciona com rede.';
  if (e instanceof Error && e.message === 'OFFLINE') return 'Sem internet: o cofre está só para leitura. Sincronize quando a rede voltar.';
  if (e instanceof Error && e.message === 'SOMENTE_LEITURA') return 'Você só tem acesso de leitura a este cofre.';
  if (e instanceof Error && e.message === 'SEM_PAR') return 'Esta conta ainda não tem as chaves de compartilhamento. Sincronize o cofre e tente de novo.';
  if (e instanceof Error && e.message === 'SO_O_DONO') return 'Só o dono do cofre pode fazer isto.';
  if (e instanceof Error && e.message === 'CHAVE_GIRADA') return 'O dono mudou o cofre. Já baixei a versão nova: tente de novo.';
  if (axios.isAxiosError(e) && e.response?.data?.error === 'SEM_PERMISSAO') return String(e.response.data.message ?? 'Você não tem permissão para isto neste cofre.');
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
    // O iOS fecha o PWA em segundo plano: dentro do tempo escolhido o cofre volta aberto, sem pedir a digital.
    if (!aberto.value) await cofre.restaurarSessao();
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

const quandoSincronizou = computed(() => {
  agora.value; // reavalia a cada segundo
  if (!copiaEm.value) return '';
  const min = Math.floor((Date.now() - new Date(copiaEm.value).getTime()) / 60_000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.floor(min / 60)} h`;
  return new Date(copiaEm.value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
});
async function sincronizar() {
  erro.value = null;
  try {
    await cofre.sincronizar();
  } catch (e) {
    erro.value = mensagemDe(e, 'Não foi possível sincronizar agora.');
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
/** Folha "Mais" do celular: as ações que não cabem na barra em telas estreitas. */
const mostrarMais = ref(false);
const doMais = (acao: () => void) => {
  mostrarMais.value = false;
  acao();
};
watch(
  aberto,
  (abriu) => {
    if (abriu && codigoParaAprovar && !pedirNovaSenha.value) mostrarAparelhos.value = true;
  },
  { immediate: true },
);
const dataHora = (d: string | Date | null) =>
  d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

// --- tranca sozinho: o relógio e a escolha do tempo moram no useCofre (ir aos apps e voltar não tranca)
const trancaMin = cofre.trancaMin;
const rotuloTempo = (min: number) => (min >= 60 ? `${min / 60} h` : `${min} min`);
const agora = ref(Date.now());
let relogio: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  relogio = setInterval(() => (agora.value = Date.now()), 1000);
});
onBeforeUnmount(() => {
  clearInterval(relogio);
  revelados.value = new Set();
  // No painel do dono, ir aos apps e voltar não tranca (só o tempo parado). Como usuário comum, sair da tela tranca.
  if (props.modo === 'usuario') trancar();
});

// --- lista. `cofreAtual` nulo = "Todos os itens" (como o Proton Pass abre).
const cofreAtual = ref<string | null>(null);
watch([cofres, compartilhados], () => {
  if (cofreAtual.value && !todosCofres.value.find((c) => c.id === cofreAtual.value)) cofreAtual.value = null;
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
// Cofres próprios + os de outras contas compartilhados com esta (db/022). Só os próprios se ordenam, editam e apagam.
const todosCofres = computed(() => [...cofres.value, ...compartilhados.value]);
const nomeDoCofre = (id: string) => todosCofres.value.find((c) => c.id === id)?.nome ?? '';
/** Papel nesse cofre: `dono` nos próprios; `leitura` ou `escrita` nos compartilhados. */
const papelDoCofre = (id: string): 'dono' | 'leitura' | 'escrita' => compartilhados.value.find((c) => c.id === id)?.papel ?? 'dono';
const podeEscrever = (id: string) => papelDoCofre(id) !== 'leitura';
const compartilhadoAtual = computed(() => compartilhados.value.find((c) => c.id === cofreAtual.value) ?? null);
const donoDoCofreNome = (id: string) => compartilhados.value.find((c) => c.id === id)?.donoNome ?? 'outra conta';
/** Cofres onde dá para guardar item: os próprios e os compartilhados com escrita. */
const cofresComEscrita = computed(() => todosCofres.value.filter((c) => podeEscrever(c.id)));
const pessoasPorCofre = computed(() => {
  const n: Record<string, number> = {};
  for (const c of cofres.value) n[c.id] = cofre.membrosDe(c.id).length;
  return n;
});
const contagem = computed(() => {
  const n: Record<string, number> = {};
  for (const i of itens.value) n[i.cofre_id] = (n[i.cofre_id] ?? 0) + 1;
  return n;
});
const cofreEscolhido = computed(() => todosCofres.value.find((c) => c.id === cofreAtual.value) ?? null);
/** O cofre aberto na lista é de leitura: o botão "Item" fica desligado. */
const cofreAtualSoLeitura = computed(() => !!cofreAtual.value && !podeEscrever(cofreAtual.value));
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
// Campos opcionais que o formulário mostra: os que já têm valor + os que o "+" acrescentou.
type CampoExtra = 'usuario' | 'senha' | 'url' | 'totp' | 'notas';
const CAMPOS_EXTRA: { id: CampoExtra; rotulo: string }[] = [
  { id: 'usuario', rotulo: 'Usuário / e-mail' },
  { id: 'senha', rotulo: 'Senha' },
  { id: 'url', rotulo: 'Endereço (URL)' },
  { id: 'totp', rotulo: 'Código 2FA' },
  { id: 'notas', rotulo: 'Nota' },
];
const camposAdicionados = ref<Set<CampoExtra>>(new Set());
const menuCampos = ref(false);
const temCampo = (c: CampoExtra) => camposAdicionados.value.has(c) || !!form.value[c].trim();
const camposFaltando = computed(() => CAMPOS_EXTRA.filter((c) => !temCampo(c.id)));
// Campos personalizados (rótulo + valor, com opção de esconder): o "+" sempre oferece, mesmo com tudo preenchido.
const camposVistos = ref<Set<number>>(new Set());
function novoCampoPersonalizado() {
  form.value = { ...form.value, campos: [...(form.value.campos ?? []), { rotulo: '', valor: '', secreto: false }] };
  menuCampos.value = false;
}
function tirarCampoPersonalizado(i: number) {
  const campos = (form.value.campos ?? []).filter((_, j) => j !== i);
  const { campos: _antigos, ...resto } = form.value;
  form.value = campos.length ? { ...resto, campos } : resto;
  camposVistos.value = new Set();
}
function alternarCampoVisto(i: number) {
  const n = new Set(camposVistos.value);
  if (!n.delete(i)) n.add(i);
  camposVistos.value = n;
}
function adicionarCampo(c: CampoExtra) {
  camposAdicionados.value = new Set(camposAdicionados.value).add(c);
  menuCampos.value = false;
}
const totpInvalido = computed(() => !!form.value.totp.trim() && !lerTotp(form.value.totp));

function novoItem() {
  // Em "Todos os itens" o item nasce no primeiro cofre; a folha deixa trocar.
  const cofreId = cofreAtual.value ?? cofres.value[0]?.id;
  if (!cofreId || !podeEscrever(cofreId)) return;
  verSenhaEdicao.value = false;
  menuCampos.value = false;
  camposAdicionados.value = new Set<CampoExtra>(['usuario', 'senha']);
  form.value = { ...VAZIO };
  editando.value = { cofreId };
}
function editarItem(item: ItemAberto) {
  verSenhaEdicao.value = false;
  menuCampos.value = false;
  camposVistos.value = new Set();
  camposAdicionados.value = new Set();
  // `entrada` (chave de entrada pelo cofre, db/016) vai junto: o formulário não mostra, mas salvar não pode perdê-la.
  const { titulo, usuario, senha, url, totp, notas, icone, campos, entrada } = item;
  form.value = { titulo, usuario, senha, url, totp, notas, ...(icone ? { icone } : {}), ...(campos?.length ? { campos: campos.map((c) => ({ ...c })) } : {}), ...(entrada ? { entrada } : {}) };
  editando.value = { id: item.id, cofreId: item.cofre_id };
}
// Clicar no cartão abre a janela do item; botões e links de dentro seguem com a ação própria.
function abrirItem(e: MouseEvent, item: ItemAberto) {
  if ((e.target as HTMLElement).closest('button, a, input, textarea')) return;
  if (offline.value || !podeEscrever(item.cofre_id)) return;
  editarItem(item);
}
// Ícone próprio do item: a imagem é reduzida a 64 px (PNG) no navegador e vai cifrada junto do item.
const erroIcone = ref<string | null>(null);
async function escolherIcone(e: Event) {
  const input = e.target as HTMLInputElement;
  const arquivo = input.files?.[0];
  input.value = '';
  if (!arquivo) return;
  erroIcone.value = null;
  if (!arquivo.type.startsWith('image/') || arquivo.size > 5_000_000) {
    erroIcone.value = 'Escolha uma imagem (PNG, JPG, WebP ou SVG) de até 5 MB.';
    return;
  }
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const lado = 64;
    const tela = document.createElement('canvas');
    tela.width = lado;
    tela.height = lado;
    const ctx = tela.getContext('2d');
    if (!ctx) throw new Error('canvas');
    const w = img.naturalWidth || lado;
    const h = img.naturalHeight || lado;
    const escala = Math.min(lado / w, lado / h);
    ctx.drawImage(img, (lado - w * escala) / 2, (lado - h * escala) / 2, w * escala, h * escala);
    form.value.icone = tela.toDataURL('image/png');
  } catch {
    erroIcone.value = 'Não consegui ler essa imagem.';
  } finally {
    URL.revokeObjectURL(url);
  }
}
function tirarIcone() {
  const { icone: _tirado, ...resto } = form.value;
  form.value = resto;
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
const editandoCofre = ref<{ id?: string; nome: string; icone?: string; cor?: string; imagem?: string } | null>(null);
function novoCofre() {
  mostrarCofres.value = false;
  editandoCofre.value = { nome: '' };
}
function editarCofre(id: string) {
  const c = cofres.value.find((x) => x.id === id);
  if (!c) return;
  mostrarCofres.value = false;
  editandoCofre.value = { id: c.id, nome: c.nome, icone: c.icone, cor: c.cor, imagem: c.imagem };
}
function pedirApagarCofre(id: string) {
  mostrarCofres.value = false;
  cofreParaApagar.value = { id, nome: nomeDoCofre(id) };
}
async function salvarCofre(dados: { nome: string; imagem: string | null } & AparenciaCofre) {
  const e = editandoCofre.value;
  if (!e) return;
  ocupado.value = true;
  erro.value = null;
  try {
    const id = await cofre.salvarCofre(dados.nome, e.id, { icone: dados.icone, cor: dados.cor, imagem: dados.imagem });
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

// --- cofre compartilhado (db/022): a folha de compartilhar e o "sair" de quem recebeu
const compartilhando = ref<{ id: string; nome: string } | null>(null);
function compartilharCofre(id: string) {
  const c = cofres.value.find((x) => x.id === id);
  if (!c) return;
  mostrarCofres.value = false;
  compartilhando.value = { id: c.id, nome: c.nome };
}
const cofreParaSair = ref<{ id: string; nome: string } | null>(null);
function pedirSair(id: string) {
  mostrarCofres.value = false;
  cofreParaSair.value = { id, nome: nomeDoCofre(id) };
}
async function sairDoCofre() {
  const alvo = cofreParaSair.value;
  if (!alvo) return;
  ocupado.value = true;
  erro.value = null;
  try {
    await cofre.sairDoCofre(alvo.id);
  } catch (err) {
    erro.value = mensagemDe(err, 'Não foi possível sair do cofre.');
  } finally {
    ocupado.value = false;
    cofreParaSair.value = null;
  }
}
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
          <!-- Celular (25/11/2026): a barra tem ~390px e 6 controles não cabem (vazava para fora da tela).
               Fica só Trancar (ícone) e "Mais"; o resto vai para a folha. sm+ segue igual. -->
          <UiButton class="sm:hidden" variante="plain" icone aria-label="Trancar" title="Trancar o cofre" @click="trancar">
            <LockClosedIcon class="h-6 w-6" />
          </UiButton>
          <UiButton class="sm:hidden" variante="plain" icone aria-label="Mais opções" title="Digital, CLI, palavra-passe e tranca automática" @click="mostrarMais = true">
            <EllipsisHorizontalCircleIcon class="h-6 w-6" />
          </UiButton>
          <div class="hidden items-center gap-1 sm:flex">
            <UiButton variante="plain" icone aria-label="Digitais" title="Abrir o cofre com a digital (Touch ID, Face ID)" @click="abrirDigitais">
              <FingerPrintIcon class="h-6 w-6" />
            </UiButton>
            <UiButton variante="plain" icone aria-label="Aparelhos do CLI" title="Máquinas aprovadas do CLI hub-pass" @click="mostrarAparelhos = true">
              <CommandLineIcon class="h-6 w-6" />
            </UiButton>
            <UiButton variante="plain" icone aria-label="Trocar palavra-passe" title="Trocar a palavra-passe" @click="abrirTrocaSenha">
              <KeyIcon class="h-6 w-6" />
            </UiButton>
            <UiButton tamanho="small" variante="gray" :disabled="offline || sincronizando" :carregando="sincronizando" title="Baixar do servidor os itens mais novos" @click="sincronizar">
              <ArrowPathIcon class="h-4 w-4" />
              Sincronizar
            </UiButton>
            <select
              v-model.number="trancaMin"
              aria-label="Trancar o cofre sozinho depois de"
              title="Trancar o cofre sozinho (pedir a digital de novo) depois deste tempo sem uso"
              class="rounded-lg bg-fill-2 px-2 py-1 text-footnote text-label outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option v-for="m in TEMPOS_TRANCA_MIN" :key="m" :value="m">Trancar em {{ rotuloTempo(m) }}</option>
            </select>
            <UiButton tamanho="small" variante="gray" @click="trancar">
              <LockClosedIcon class="h-4 w-4" />
              Trancar
            </UiButton>
          </div>
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
      <p v-if="offline" role="status" class="rounded-celula bg-warning/10 p-3 text-subhead text-warning">
        Sem internet: abra pela digital (Face ID) para ler a cópia de {{ quandoSincronizou }}. A palavra-passe só funciona com rede.
      </p>
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
        <CofreLista :cofres="cofres" :compartilhados="compartilhados" :pessoas="pessoasPorCofre" :contagem="contagem" :total="itens.length" :atual="cofreAtual" :ocupado="ocupado" @escolher="escolherCofre" @novo="novoCofre" @editar="editarCofre" @apagar="pedirApagarCofre" @reordenar="reordenarCofres" @compartilhar="compartilharCofre" @sair="pedirSair" />
      </aside>

      <div class="space-y-4">
        <p v-if="offline" role="status" class="rounded-celula bg-warning/10 p-3 text-subhead text-warning">
          Sem internet: cópia de {{ quandoSincronizou }}, só para leitura. Ver e copiar senhas e o código 2FA funciona; criar, editar e apagar voltam com a rede.
        </p>
        <p v-else-if="copiaEm" class="text-caption-1 text-label-2">Sincronizado {{ quandoSincronizou }}</p>
        <p v-if="ilegiveis > 0" class="rounded-celula bg-warning/10 p-3 text-subhead text-warning">
          {{ ilegiveis }} registro(s) não abriram: foram alterados fora do cofre ou estão corrompidos.
        </p>
        <p v-if="erro" role="alert" class="rounded-celula bg-danger/10 p-3 text-subhead text-danger">{{ erro }}</p>

        <!-- Cofres compartilhados que NÃO abriram (db/022): remetente não autenticado ou código do dono mudado. -->
        <div v-for="n in naoVerificados" :key="n.id" role="alert" class="space-y-2 rounded-celula bg-danger/10 p-3 text-subhead text-danger">
          <p v-if="n.motivo === 'selo'">
            <strong>Não foi possível verificar</strong> um cofre que {{ n.donoNome ?? 'outra conta' }} compartilhou com você: ele não prova que veio dela. Não foi aberto.
          </p>
          <template v-else>
            <p>
              <strong>Atenção:</strong> o código de verificação de {{ n.donoNome ?? 'quem compartilhou este cofre' }} mudou. Fixado antes:
              <span class="font-mono">{{ n.codigoFixado }}</span>; agora: <span class="font-mono">{{ n.codigoNovo }}</span>. O cofre não foi aberto. Só confie se ela confirmar o código novo por outro canal.
            </p>
            <UiButton variante="destructive-tinted" tamanho="small" @click="cofre.confiarNoCodigoNovo(n.dono)">Confiar no código novo</UiButton>
          </template>
        </div>
        <p v-if="compartilhadoAtual" class="rounded-celula bg-fill-2 p-3 text-footnote text-label-2">
          Compartilhado por <strong>{{ compartilhadoAtual.donoNome ?? 'outra conta' }}</strong>. Código de verificação dela:
          <span class="select-all font-mono">{{ compartilhadoAtual.donoCodigo }}</span> (confira por outro canal; se mudar, o cofre avisa).
        </p>

        <button type="button" class="flex w-full items-center gap-3 rounded-celula bg-surface p-2 text-left lg:hidden" aria-haspopup="dialog" @click="mostrarCofres = true">
          <CofreIcone v-if="cofreEscolhido" :icone="cofreEscolhido.icone" :cor="cofreEscolhido.cor" :imagem="cofreEscolhido.imagem" />
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
          <UiButton v-if="cofreAtual && papelDoCofre(cofreAtual) === 'dono'" tamanho="small" variante="gray" title="Compartilhar este cofre com outra conta" @click="compartilharCofre(cofreAtual)">
            <UserPlusIcon class="h-4 w-4" />Compartilhar
          </UiButton>
          <UiButton tamanho="small" :disabled="cofres.length === 0 || offline || cofreAtualSoLeitura" :title="cofreAtualSoLeitura ? 'Você só tem acesso de leitura a este cofre' : undefined" @click="novoItem"><PlusIcon class="h-4 w-4" />Item</UiButton>
        </div>

        <UiEmpty
          v-if="visiveis.length === 0"
          :icone="KeyIcon"
          :titulo="busca ? 'Nada encontrado.' : cofres.length === 0 ? 'Nenhum cofre ainda.' : 'Cofre vazio.'"
          :texto="busca ? undefined : cofres.length === 0 ? 'Crie um cofre pelo + da lista de cofres.' : 'Guarde aqui senhas e códigos 2FA.'"
        />

        <ul v-else class="space-y-2">
          <li v-for="item in visiveis" :key="item.id" class="item-cofre cursor-pointer overflow-hidden rounded-celula bg-surface p-4" @click="abrirItem($event, item)">
            <div class="flex items-start gap-3">
              <CofreItemIcone :titulo="item.titulo" :url="item.url" :apps="logosDosApps" :icone="item.icone" />
              <div class="min-w-0 flex-1 space-y-1">
                <p class="flex flex-wrap items-center gap-2 text-headline font-semibold">
                  <span class="truncate">{{ item.titulo }}</span>
                  <UiBadge v-if="busca || cofreAtual === null">{{ nomeDoCofre(item.cofre_id) }}</UiBadge>
                  <UiBadge v-if="papelDoCofre(item.cofre_id) !== 'dono'" :tom="papelDoCofre(item.cofre_id) === 'escrita' ? 'accent' : 'neutro'" :title="`Cofre de ${donoDoCofreNome(item.cofre_id)}`">
                    {{ papelDoCofre(item.cofre_id) === 'escrita' ? 'compartilhado · escrita' : 'compartilhado · somente leitura' }}
                  </UiBadge>
                  <UiBadge v-if="item.entrada" title="Chave de entrada pelo cofre (db/016): o app entra com ela">entrada pelo cofre</UiBadge>
                </p>
                <a v-if="item.url" :href="/^https?:\/\//i.test(item.url) ? item.url : undefined" target="_blank" rel="noopener noreferrer" class="block truncate text-footnote text-accent">{{ item.url }}</a>

                <div v-if="item.usuario" class="flex items-center gap-2 text-subhead">
                  <span class="w-16 shrink-0 text-label-2">Usuário</span>
                  <span class="min-w-0 truncate font-mono">{{ item.usuario }}</span>
                  <button type="button" class="text-accent" :title="'Copiar usuário'" @click="copiar(item.usuario, item.id + ':u')">
                    <ClipboardDocumentIcon class="h-4 w-4" />
                  </button>
                  <span v-if="copiado === item.id + ':u'" class="text-caption-1 text-success">copiado</span>
                </div>

                <div v-if="item.senha" class="flex items-center gap-2 text-subhead">
                  <span class="w-16 shrink-0 text-label-2">Senha</span>
                  <span class="min-w-0 truncate font-mono">{{ revelados.has(item.id) ? item.senha : '••••••••••' }}</span>
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

                <div v-for="(c, i) in item.campos ?? []" :key="i" class="flex items-center gap-2 text-subhead">
                  <span class="w-16 shrink-0 truncate text-label-2" :title="c.rotulo">{{ c.rotulo }}</span>
                  <span class="min-w-0 truncate font-mono">{{ c.secreto && !revelados.has(item.id + ':c' + i) ? '••••••••••' : c.valor }}</span>
                  <button v-if="c.secreto" type="button" class="text-label-2" :title="revelados.has(item.id + ':c' + i) ? 'Esconder' : 'Mostrar'" @click="alternarRevelar(item.id + ':c' + i)">
                    <EyeSlashIcon v-if="revelados.has(item.id + ':c' + i)" class="h-4 w-4" /><EyeIcon v-else class="h-4 w-4" />
                  </button>
                  <button type="button" class="text-accent" title="Copiar" @click="copiar(c.valor, item.id + ':c' + i)">
                    <ClipboardDocumentIcon class="h-4 w-4" />
                  </button>
                  <span v-if="copiado === item.id + ':c' + i" class="text-caption-1 text-success">copiado</span>
                </div>

                <p v-if="item.notas" class="whitespace-pre-wrap break-all text-footnote text-label-2">{{ item.notas }}</p>
              </div>
              <div class="flex shrink-0 flex-col gap-1">
                <UiButton variante="plain" icone :disabled="offline || !podeEscrever(item.cofre_id)" :title="podeEscrever(item.cofre_id) ? undefined : 'Somente leitura'" :aria-label="`Editar ${item.titulo}`" @click="editarItem(item)"><PencilSquareIcon class="h-5 w-5" /></UiButton>
                <UiButton variante="plain" icone :disabled="offline || !podeEscrever(item.cofre_id)" :title="podeEscrever(item.cofre_id) ? undefined : 'Somente leitura'" class="!text-danger hover:!bg-danger/10" :aria-label="`Apagar ${item.titulo}`" @click="itemParaApagar = item">
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
      <CofreLista :cofres="cofres" :compartilhados="compartilhados" :pessoas="pessoasPorCofre" :contagem="contagem" :total="itens.length" :atual="cofreAtual" :ocupado="ocupado" @escolher="escolherCofre" @novo="novoCofre" @editar="editarCofre" @apagar="pedirApagarCofre" @reordenar="reordenarCofres" @compartilhar="compartilharCofre" @sair="pedirSair" />
    </UiSheet>

    <!-- FOLHA: item -->
    <UiSheet :aberto="!!editando" :titulo="editando?.id ? 'Editar item' : 'Novo item'" :subtitulo="editando ? nomeDoCofre(editando.cofreId) : ''" :bloqueado="ocupado" @fechar="editando = null">
      <form v-if="editando" id="form-item" class="space-y-3" @submit.prevent="salvarItem">
        <!-- Trocar o cofre de um item que já existe move o item: ele é recifrado com a chave do cofre novo. -->
        <UiSelect v-if="cofresComEscrita.length > 1" v-model="editando.cofreId" rotulo="Cofre" :opcoes="cofresComEscrita.map((c) => ({ valor: c.id, rotulo: papelDoCofre(c.id) === 'dono' ? c.nome : `${c.nome} (compartilhado)` }))" />
        <UiTextField v-model="form.titulo" rotulo="Título" placeholder="Ex.: GitHub, Cloudflare, awlsrv sudo" required />
        <div class="flex items-center gap-3">
          <CofreItemIcone :titulo="form.titulo" :url="form.url" :apps="logosDosApps" :icone="form.icone" />
          <label class="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-accent hover:bg-accent/10" title="Escolher uma imagem para o ícone" aria-label="Escolher imagem do ícone">
            <PhotoIcon class="h-5 w-5" />
            <input type="file" accept="image/*" class="sr-only" @change="escolherIcone" />
          </label>
          <UiButton v-if="form.icone" variante="plain" icone title="Voltar ao ícone do site" aria-label="Voltar ao ícone do site" @click="tirarIcone"><XMarkIcon class="h-5 w-5" /></UiButton>
          <p v-if="erroIcone" class="text-caption-1 text-danger">{{ erroIcone }}</p>
        </div>
        <UiTextField v-if="temCampo('usuario')" v-model="form.usuario" rotulo="Usuário / e-mail" autocomplete="off" />
        <div v-if="temCampo('senha')" class="space-y-1">
          <UiTextField v-model="form.senha" rotulo="Senha" :type="verSenhaEdicao ? 'text' : 'password'" autocomplete="new-password" />
          <div class="flex gap-2">
            <UiButton variante="plain" icone :title="verSenhaEdicao ? 'Esconder a senha' : 'Mostrar a senha'" :aria-label="verSenhaEdicao ? 'Esconder a senha' : 'Mostrar a senha'" @click="verSenhaEdicao = !verSenhaEdicao">
              <EyeSlashIcon v-if="verSenhaEdicao" class="h-5 w-5" /><EyeIcon v-else class="h-5 w-5" />
            </UiButton>
            <UiButton variante="plain" tamanho="small" @click="gerarNaEdicao">
              <ArrowPathIcon class="h-4 w-4" />Gerar senha forte
            </UiButton>
          </div>
        </div>
        <UiTextField v-if="temCampo('url')" v-model="form.url" rotulo="Endereço (URL)" placeholder="https://…" autocomplete="off" />
        <UiTextField
          v-if="temCampo('totp')"
          v-model="form.totp"
          rotulo="Chave do 2FA"
          placeholder="JBSW Y3DP… ou otpauth://totp/…"
          autocomplete="off"
          dica="A chave que o site mostra ao ativar o 2FA (texto embaixo do QR). O cofre passa a mostrar o código de 6 dígitos."
          :erro="totpInvalido ? 'Chave de 2FA inválida.' : null"
        />
        <label v-if="temCampo('notas')" class="block text-footnote text-label-2">
          Notas
          <textarea v-model="form.notas" rows="4" class="mt-1 w-full rounded-lg bg-fill-2 p-3 text-body text-label outline-none focus:ring-2 focus:ring-accent/40" />
        </label>
        <div v-for="(c, i) in form.campos ?? []" :key="i" class="space-y-1 rounded-controle bg-fill-2 p-2">
          <div class="flex items-center gap-2">
            <input v-model="c.rotulo" type="text" placeholder="Nome do campo" autocomplete="off" class="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 text-footnote text-label-2 outline-none focus:ring-2 focus:ring-accent/40" />
            <UiButton variante="plain" icone title="Esconder ou mostrar o valor" aria-label="Esconder ou mostrar o valor" @click="c.secreto = !c.secreto">
              <EyeSlashIcon v-if="c.secreto" class="h-5 w-5" /><EyeIcon v-else class="h-5 w-5" />
            </UiButton>
            <UiButton variante="plain" icone class="!text-danger" title="Remover o campo" aria-label="Remover o campo" @click="tirarCampoPersonalizado(i)"><TrashIcon class="h-5 w-5" /></UiButton>
          </div>
          <input v-model="c.valor" :type="c.secreto && !camposVistos.has(i) ? 'password' : 'text'" placeholder="Valor" autocomplete="off" class="w-full rounded-lg bg-surface p-2 text-body text-label outline-none focus:ring-2 focus:ring-accent/40" @dblclick="alternarCampoVisto(i)" />
        </div>
        <div class="pt-1">
          <UiButton variante="plain" tamanho="small" :aria-expanded="menuCampos" @click="menuCampos = !menuCampos"><PlusIcon class="h-4 w-4" />Adicionar campo</UiButton>
          <div v-if="menuCampos" class="mt-2 flex flex-wrap gap-2">
            <UiButton v-for="c in camposFaltando" :key="c.id" variante="gray" tamanho="small" @click="adicionarCampo(c.id)"><PlusIcon class="h-4 w-4" />{{ c.rotulo }}</UiButton>
            <UiButton variante="gray" tamanho="small" @click="novoCampoPersonalizado"><PlusIcon class="h-4 w-4" />Campo personalizado</UiButton>
          </div>
        </div>
      </form>
      <template #acoes>
        <UiButton variante="gray" @click="editando = null">Cancelar</UiButton>
        <UiButton type="submit" form="form-item" :carregando="ocupado" :disabled="!form.titulo.trim() || totpInvalido">Salvar</UiButton>
      </template>
    </UiSheet>

    <!-- FOLHA: compartilhar o cofre com outra conta (db/022) -->
    <CofreCompartilhar :cofre="compartilhando" @fechar="compartilhando = null" />

    <UiAlert
      :aberto="!!cofreParaSair"
      tom="danger"
      titulo="Sair deste cofre?"
      :destaque="cofreParaSair?.nome"
      confirmar="Sair"
      :carregando="ocupado"
      @fechar="cofreParaSair = null"
      @confirmar="sairDoCofre"
    >
      Você perde o acesso a ele. O dono continua com tudo e pode convidar você de novo.
    </UiAlert>

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
    <UiSheet :aberto="mostrarMais" titulo="Cofre" largura="sm" @fechar="mostrarMais = false">
      <div class="divide-y overflow-hidden rounded-celula bg-surface [&>*]:border-separator">
        <UiRow clicavel :titulo="sincronizando ? 'Sincronizando…' : 'Sincronizar'" subtitulo="Baixar do servidor os itens mais novos" :class="offline ? 'pointer-events-none opacity-40' : ''" @click="doMais(sincronizar)">
          <template #icone><ArrowPathIcon class="text-accent" /></template>
        </UiRow>
        <UiRow clicavel chevron titulo="Digital" subtitulo="Abrir com Touch ID ou Face ID" @click="doMais(abrirDigitais)">
          <template #icone><FingerPrintIcon class="text-accent" /></template>
        </UiRow>
        <UiRow clicavel chevron titulo="Aparelhos do CLI" subtitulo="Máquinas aprovadas do hub-pass" @click="doMais(() => (mostrarAparelhos = true))">
          <template #icone><CommandLineIcon class="text-accent" /></template>
        </UiRow>
        <UiRow clicavel chevron titulo="Trocar a palavra-passe" @click="doMais(abrirTrocaSenha)">
          <template #icone><KeyIcon class="text-accent" /></template>
        </UiRow>
        <UiRow titulo="Trancar sozinho">
          <template #icone><LockClosedIcon class="text-accent" /></template>
          <template #direita>
            <select
              v-model.number="trancaMin"
              aria-label="Trancar o cofre sozinho depois de"
              class="rounded-lg bg-fill-2 px-2 py-1 text-subhead text-label outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option v-for="m in TEMPOS_TRANCA_MIN" :key="m" :value="m">em {{ rotuloTempo(m) }}</option>
            </select>
          </template>
        </UiRow>
      </div>
    </UiSheet>

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
