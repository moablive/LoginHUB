import { computed, ref, shallowRef, watch } from 'vue';
import { cofreApi } from '@loginhub/api-client';
import type { CofreAparelho, CofreAparelhoAcesso, CofreAparelhoPedido, CofreDigital, CofreEntradaPedido, CofreEstado, CofreMembro, CofrePapel } from '@loginhub/schema';
import { randomBytes } from '@noble/ciphers/utils.js';
import { imagemDoCofreValida, type AparenciaCofre } from './aparencia';
import { criarDigital, digitalLocal, esquecerDigitalLocal, lembrarDigitalLocal, pedirSegredo } from './digital';
import { apagarSessao, codigoFixadoDoDono, fixarCodigoDoDono, guardarCopia, guardarSessao, lerCopia, lerSessao, pedirPersistencia, tocarSessao, ultimoDono } from './local';
import { adSelo, codigoDoPedido, limparCodigo, provaDoAparelho, selar, type ParDoAparelho } from './pareamento';
import { abrirCofreSelado, abrirPar, codigoDaChave, novoParDaPessoa, prepararGiro, protegerPar, provaDoMembro, selarCofre } from './compartilhar';
import type { DadosCartao, DadosDocumento, TipoItem } from './tipos';
import { assinarEntrada, desafioDoPasse, mensagemDaEntrada, novaChaveDeEntrada, type EntradaDoItem } from './entrada';
import {
  adCofre,
  adContaKit,
  adContaPrf,
  adContaSenha,
  adItem,
  b64,
  chaveDoKit,
  chaveDoPrf,
  chaveMestraDe,
  cifrar,
  cifrarJson,
  decifrar,
  decifrarJson,
  deB64,
  kitDeTexto,
  novaChave,
  novoId,
  novoKit,
  novosParametrosKdf,
} from './cripto';

/**
 * Estado do cofre ABERTO. As chaves moram só na memória desta aba (nunca no
 * localStorage): trancar, recarregar a página ou fechar a aba esquece tudo.
 */

export interface CofreAberto {
  id: string;
  nome: string;
  chave: Uint8Array;
  /** Identificadores de `aparencia.ts`; cofre antigo não tem e cai no padrão. */
  icone?: string;
  cor?: string;
  /** Miniatura (data: URL) que o dono pôs no lugar do ícone (24/11/2026). */
  imagem?: string;
  /** Posição na lista, escolhida pelo dono (23/11/2026). Sem ela, o cofre vai depois dos ordenados, por nome. */
  ordem?: number;
  /** db/023: geração da chave do cofre; vai em toda escrita de item (o servidor recusa se girou). */
  geracao?: number;
}

/**
 * Cofre de outra conta aberto para esta (db/022): a chave veio selada para o par X25519 desta conta. `papel` diz se
 * a pessoa só lê ou também escreve; `selo` é o que o servidor confere em cada escrita (a chave já girou?).
 */
export interface CofreCompartilhadoAberto extends CofreAberto {
  papel: CofrePapel;
  dono: string;
  donoNome: string | null;
  selo: string;
  /** Código de verificação do DONO (da chave pública dele, autenticada pelo selo e fixada na 1ª abertura). */
  donoCodigo: string;
}

/** Cofre compartilhado que NÃO abriu: o selo não autentica o remetente, ou o código do dono mudou desde que foi fixado. */
export interface CofreNaoVerificado {
  id: string;
  dono: string;
  donoNome: string | null;
  motivo: 'selo' | 'codigo';
  /** Só em `codigo`: o código novo (a pessoa pode confiar nele) e o que estava fixado. */
  codigoNovo?: string;
  codigoFixado?: string;
}

export interface CampoExtraItem {
  rotulo: string;
  valor: string;
  secreto: boolean;
}

export interface ItemCofre {
  titulo: string;
  usuario: string;
  senha: string;
  url: string;
  /** Chave base32 ou URI otpauth:// do 2FA do site. */
  totp: string;
  notas: string;
  /** Ícone escolhido pelo usuário (data:image/png reduzido a 64 px), vai cifrado junto do item; vence o favicon do site. */
  icone?: string;
  /** Campos extras que o usuário criou pelo "+" (rótulo, valor e se o valor fica escondido); vão cifrados com o item. */
  campos?: CampoExtraItem[];
  /** Item que guarda a chave de entrada de uma conta de app (db/016). */
  entrada?: EntradaDoItem;
  /** Cartão e documento (27/11/2026): ausente = login. Nos dois casos os campos de login ficam vazios. */
  tipo?: TipoItem;
  cartao?: DadosCartao;
  documento?: DadosDocumento;
}

export interface ItemAberto extends ItemCofre {
  id: string;
  cofre_id: string;
  atualizado_em: string;
}

const bruto = shallowRef<CofreEstado | null>(null);

// O dono ('master' ou 'u:<id>') vem do servidor e entra nos dados associados da
// cifra: o cofre de uma conta não abre como se fosse de outra.
const dono = (): string => {
  const d = bruto.value?.dono;
  if (!d) throw new Error('SEM_DONO');
  return d;
};
const chaveConta = shallowRef<Uint8Array | null>(null);
const cofres = ref<CofreAberto[]>([]);
/** Cofres de outras contas compartilhados com esta (db/022). `cofres` continua sendo só os PRÓPRIOS. */
const compartilhados = ref<CofreCompartilhadoAberto[]>([]);
const naoVerificados = ref<CofreNaoVerificado[]>([]);
/** Itens dos cofres próprios E dos compartilhados (`cofre_id` diz de qual). */
const itens = ref<ItemAberto[]>([]);
/** O par X25519 desta conta, aberto na memória enquanto o cofre estiver aberto. */
const par = shallowRef<ParDoAparelho | null>(null);
/** Só tenta criar o par uma vez por abertura: falha persistente não vira laço. */
let tentouPar = false;
/** Quantos registros não abriram (corrompidos ou mexidos no servidor). */
const ilegiveis = ref(0);

const aberto = computed(() => chaveConta.value !== null);
const existe = computed(() => !!bruto.value?.conta);
/** Alguma digital (passkey com PRF) abre este cofre? A tela trancada mostra o botão. */
const temDigital = computed(() => (bruto.value?.digitais?.length ?? 0) > 0);
const digitais = ref<CofreDigital[]>([]);

/** Sem rede o cofre abre a cópia que ficou no aparelho (só leitura). `copiaEm` = quando o servidor a entregou. */
const offline = ref(false);
const copiaEm = ref<string | null>(null);
const sincronizando = ref(false);

/** Falha de rede (não chegou ao servidor)? Erro com resposta (401, 500…) NÃO é offline: vale como erro de verdade. */
const semRede = (e: unknown): boolean => {
  const r = (e as { response?: unknown } | null)?.response;
  return !r && (typeof navigator === 'undefined' || navigator.onLine === false || (e as { code?: string } | null)?.code === 'ERR_NETWORK');
};

async function carregar(): Promise<void> {
  try {
    const estado = await cofreApi.estado();
    bruto.value = estado;
    offline.value = false;
    copiaEm.value = new Date().toISOString();
    void guardarCopia(estado);
  } catch (e) {
    const dono = ultimoDono();
    const copia = semRede(e) && dono ? await lerCopia(dono) : null;
    if (!copia) throw e;
    bruto.value = copia.estado;
    offline.value = true;
    copiaEm.value = copia.em;
  }
}

/** Botão Sincronizar (e volta da rede): baixa o estado de novo e reabre os itens com a chave que já está aberta. */
async function sincronizar(): Promise<void> {
  if (sincronizando.value) return;
  sincronizando.value = true;
  try {
    await carregar();
    if (offline.value) throw new Error('OFFLINE');
    if (chaveConta.value) await abrirTudo();
  } finally {
    sincronizando.value = false;
  }
}

const exigeRede = (): void => {
  if (offline.value) throw new Error('OFFLINE');
};

/** Reabre o cofre com a chave guardada no aparelho, se ainda estiver dentro do tempo escolhido (sem pedir a digital). */
async function restaurarSessao(): Promise<boolean> {
  if (chaveConta.value || !bruto.value?.conta) return false;
  const chave = await lerSessao(dono(), trancaMin.value * 60_000);
  if (!chave) return false;
  chaveConta.value = chave;
  await abrirTudo();
  return aberto.value;
}

/** Número da última abertura: uma abertura lenta (WebCrypto) que perdeu a corrida para outra não sobrescreve o resultado. */
let geracaoAbertura = 0;

async function abrirTudo(): Promise<void> {
  const conta = chaveConta.value;
  const estado = bruto.value;
  if (!conta || !estado) return;
  const minha = ++geracaoAbertura;
  let falhas = 0;
  const abertos: CofreAberto[] = [];
  for (const c of estado.cofres) {
    try {
      const d = decifrarJson<{ nome: string; chave: string; icone?: string; cor?: string; imagem?: string; ordem?: number }>(conta, c.dados, adCofre(dono(), c.id));
      abertos.push({ id: c.id, nome: d.nome, chave: deB64(d.chave), icone: d.icone, cor: d.cor, imagem: imagemDoCofreValida(d.imagem) ? d.imagem : undefined, ordem: typeof d.ordem === 'number' ? d.ordem : undefined, geracao: c.geracao });
    } catch {
      falhas++;
    }
  }
  // Cofres de outras contas (db/022): o par X25519 desta conta abre o selo de cada um. A pública do par é DERIVADA da
  // privada (`PAR_ADULTERADO` se o servidor entregou outra) e o selo tem de autenticar o dono (`REMETENTE_NAO_CONFERE`).
  let parAberto: ParDoAparelho | null = null;
  let regravarPar: { chave_publica: string; chave_privada: string } | undefined;
  if (estado.pessoa) {
    try {
      const r = await abrirPar(conta, dono(), estado.pessoa);
      parAberto = r.par;
      regravarPar = r.regravar;
    } catch {
      falhas++;
    }
  }
  const outros: CofreCompartilhadoAberto[] = [];
  const recusados: CofreNaoVerificado[] = [];
  for (const c of estado.compartilhados ?? []) {
    const base = { id: c.id, dono: c.dono, donoNome: c.dono_nome };
    if (!parAberto || !c.dono_chave_publica) {
      recusados.push({ ...base, motivo: 'selo' });
      continue;
    }
    try {
      const d = await abrirCofreSelado(parAberto, c.chave_selada, { cofreId: c.id, dono: c.dono, membro: dono(), publicaDoDono: c.dono_chave_publica });
      const codigo = codigoDaChave(c.dono_chave_publica);
      const fixado = codigoFixadoDoDono(dono(), c.dono);
      if (fixado && fixado !== codigo) {
        recusados.push({ ...base, motivo: 'codigo', codigoNovo: codigo, codigoFixado: fixado });
        continue;
      }
      if (!fixado) fixarCodigoDoDono(dono(), c.dono, codigo);
      outros.push({ id: c.id, nome: d.nome, chave: deB64(d.chave), icone: d.icone, cor: d.cor, papel: c.papel, dono: c.dono, donoNome: c.dono_nome, selo: c.chave_selada, donoCodigo: codigo, geracao: c.geracao });
    } catch {
      recusados.push({ ...base, motivo: 'selo' });
    }
  }
  const lista: ItemAberto[] = [];
  const abertosIds = new Set(outros.map((c) => c.id));
  const todosItens = [...estado.itens, ...(estado.compartilhados ?? []).filter((c) => abertosIds.has(c.id)).flatMap((c) => c.itens)];
  for (const i of todosItens) {
    const cofre = abertos.find((c) => c.id === i.cofre_id) ?? outros.find((c) => c.id === i.cofre_id);
    if (!cofre) {
      falhas++;
      continue;
    }
    try {
      const d = decifrarJson<ItemCofre>(cofre.chave, i.dados, adItem(i.cofre_id, i.id));
      lista.push({ ...d, id: i.id, cofre_id: i.cofre_id, atualizado_em: String(i.atualizado_em) });
    } catch {
      falhas++;
    }
  }
  if (minha !== geracaoAbertura || chaveConta.value !== conta) return;
  // Primeiro os que o dono pôs em ordem; os outros (cofre antigo, criado pelo CLI) depois, por nome.
  abertos.sort((a, b) => (a.ordem ?? Infinity) - (b.ordem ?? Infinity) || a.nome.localeCompare(b.nome, 'pt-BR'));
  outros.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  lista.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
  cofres.value = abertos;
  compartilhados.value = outros;
  naoVerificados.value = recusados;
  itens.value = lista;
  par.value = parAberto;
  ilegiveis.value = falhas;
  pedirPersistencia();
  void guardarSessao(dono(), conta);
  // Conta que abriu o cofre antes desta versão ainda não tem par: ganha agora, no navegador (estado.pessoa === null).
  if (estado.pessoa === null && !offline.value && !tentouPar) void garantirPar();
  // Par criado antes de a pública entrar no dado associado: recifra e devolve ao servidor (a mesma chave pública).
  if (regravarPar && !offline.value) void cofreApi.salvarPessoa(regravarPar).then(() => carregar()).catch(() => undefined);
}

/** Gera e guarda o par X25519 desta conta (a privada cifrada com a chave da conta). */
async function garantirPar(): Promise<void> {
  const conta = chaveConta.value;
  if (!conta || tentouPar) return;
  tentouPar = true;
  try {
    await cofreApi.salvarPessoa(protegerPar(conta, dono(), await novoParDaPessoa()));
  } catch (e) {
    // 409: outra aba já gerou. Qualquer outro erro: o cofre segue sem compartilhar (a folha avisa).
    if ((e as { response?: { status?: number } }).response?.status !== 409) return;
  }
  await carregar();
  await abrirTudo();
}

/** Cria o cofre: devolve o kit de recuperação, que a tela mostra UMA vez. */
async function criar(palavraPasse: string): Promise<string> {
  if (!bruto.value) await carregar();
  const kdf = novosParametrosKdf();
  const mestra = await chaveMestraDe(palavraPasse, kdf);
  const conta = novaChave();
  const kit = novoKit();
  await cofreApi.criarConta({
    kdf,
    chave_por_senha: cifrar(mestra, conta, adContaSenha(dono())),
    chave_por_kit: cifrar(chaveDoKit(kit.bytes), conta, adContaKit(dono())),
  });
  mestra.fill(0);
  kit.bytes.fill(0);
  await carregar();
  chaveConta.value = conta;
  // Primeiro cofre já pronto, para começar a guardar.
  await salvarCofre('Geral');
  return kit.texto;
}

/** Lança `CHAVE_ERRADA` se a palavra-passe não abre. */
async function abrirComSenha(palavraPasse: string): Promise<void> {
  await carregar();
  if (offline.value) throw new Error('OFFLINE_SEM_SENHA');
  const conta = bruto.value?.conta;
  if (!conta) throw new Error('SEM_COFRE');
  const mestra = await chaveMestraDe(palavraPasse, conta.kdf);
  try {
    chaveConta.value = decifrar(mestra, conta.chave_por_senha, adContaSenha(dono()));
  } finally {
    mestra.fill(0);
  }
  await abrirTudo();
}

/**
 * Confere a palavra-passe SEM mexer no cofre aberto (27/11/2026: apagar item pede a palavra-passe). Lança
 * `CHAVE_ERRADA` se não bate. A conferência é local: o servidor só tem texto cifrado.
 */
async function conferirSenha(palavraPasse: string): Promise<void> {
  const conta = bruto.value?.conta;
  if (!conta) throw new Error('SEM_COFRE');
  const mestra = await chaveMestraDe(palavraPasse, conta.kdf);
  try {
    decifrar(mestra, conta.chave_por_senha, adContaSenha(dono())).fill(0);
  } finally {
    mestra.fill(0);
  }
}

/**
 * Prova que quem está na frente da tela é a pessoa (28/11/2026: revelar e copiar cartão/documento pedem de novo) lendo a
 * digital SEM mexer no cofre aberto: o segredo PRF tem de abrir o embrulho da chave da conta, como na abertura.
 */
async function provarPresencaComDigital(): Promise<void> {
  const lista = bruto.value?.digitais ?? [];
  if (!chaveConta.value || !lista.length) throw new Error('SEM_DIGITAL');
  const daqui = lista.find((x) => x.credencial_id === digitalLocal());
  const candidatas = daqui ? [daqui] : lista;
  const { credencialId, segredo } = await pedirSegredo(candidatas.map((d) => ({ credencial_id: d.credencial_id, prf_sal: deB64(d.prf_sal) })));
  const d = lista.find((x) => x.credencial_id === credencialId);
  if (!d) {
    segredo.fill(0);
    throw new Error('DIGITAL_NAO_ABRE');
  }
  const chave = chaveDoPrf(segredo);
  segredo.fill(0);
  try {
    decifrar(chave, d.chave_por_digital, adContaPrf(dono(), d.credencial_id)).fill(0);
  } catch {
    throw new Error('DIGITAL_NAO_ABRE');
  } finally {
    chave.fill(0);
  }
}

/** Abre pelo kit de recuperação. Depois disso a tela pede uma palavra-passe nova. */
async function abrirComKit(kitTexto: string): Promise<void> {
  await carregar();
  if (offline.value) throw new Error('OFFLINE_SEM_SENHA');
  const conta = bruto.value?.conta;
  if (!conta) throw new Error('SEM_COFRE');
  const kit = kitDeTexto(kitTexto);
  chaveConta.value = decifrar(chaveDoKit(kit), conta.chave_por_kit, adContaKit(dono()));
  kit.fill(0);
  await abrirTudo();
}

/**
 * Abre pela digital (db/015): o aparelho devolve o segredo PRF de uma das
 * digitais cadastradas e ele desembrulha a chave da conta. Lança `ErroDigital`
 * (cancelado, sem PRF) ou `CHAVE_ERRADA` (embrulho mexido).
 */
async function abrirComDigital(): Promise<void> {
  await carregar();
  const lista = bruto.value?.digitais ?? [];
  if (!bruto.value?.conta || !lista.length) throw new Error('SEM_DIGITAL');
  // A digital deste navegador, se ele lembra qual é (e ela ainda vale): pede só ela. Senão, a lista inteira.
  const daqui = lista.find((x) => x.credencial_id === digitalLocal());
  const candidatas = daqui ? [daqui] : lista;
  const { credencialId, segredo } = await pedirSegredo(candidatas.map((d) => ({ credencial_id: d.credencial_id, prf_sal: deB64(d.prf_sal) })));
  const d = lista.find((x) => x.credencial_id === credencialId);
  if (!d) {
    segredo.fill(0);
    throw new Error('DIGITAL_NAO_ABRE');
  }
  const chave = chaveDoPrf(segredo);
  segredo.fill(0);
  try {
    chaveConta.value = decifrar(chave, d.chave_por_digital, adContaPrf(dono(), d.credencial_id));
  } catch {
    // O aparelho leu a digital, mas o segredo não é o do cadastro: esta digital não serve mais.
    esquecerDigitalLocal(d.credencial_id);
    throw new Error('DIGITAL_NAO_ABRE');
  } finally {
    chave.fill(0);
  }
  lembrarDigitalLocal(d.credencial_id);
  await abrirTudo();
  cofreApi.usouDigital(d.id).catch(() => undefined);
}

/**
 * Digital criada no aparelho e ainda não confirmada (24/11/2026). O cadastro tem
 * dois toques: criar a passkey e LER a digital — é a leitura que dá o segredo do
 * embrulho, o mesmo que a abertura do cofre vai pedir. Alguns navegadores (Safari
 * do iPhone) só aceitam a segunda chamada depois de um toque novo da pessoa: aí a
 * tela mostra "Confirmar a digital" e chama `concluirDigital`.
 */
const digitalPendente = shallowRef<{ credencialId: string; sal: Uint8Array; nome: string } | null>(null);

/** Cadastra a digital deste aparelho (só com o cofre aberto: precisa da chave da conta). */
async function ativarDigital(nome: string): Promise<void> {
  exigeRede();
  if (!chaveConta.value) throw new Error('TRANCADO');
  const sal = randomBytes(32);
  const { credencialId } = await criarDigital(dono(), nome, sal);
  digitalPendente.value = { credencialId, sal, nome: nome.trim().slice(0, 120) || 'Aparelho' };
  await concluirDigital();
}

/** Lê a digital recém-criada e grava o embrulho. Se a leitura falhar, a pendente fica para um novo toque. */
async function concluirDigital(): Promise<void> {
  const conta = chaveConta.value;
  const p = digitalPendente.value;
  if (!conta) throw new Error('TRANCADO');
  if (!p) throw new Error('SEM_DIGITAL');
  const { credencialId, segredo } = await pedirSegredo([{ credencial_id: p.credencialId, prf_sal: p.sal }]);
  const chave = chaveDoPrf(segredo);
  segredo.fill(0);
  try {
    if (credencialId !== p.credencialId) throw new Error('DIGITAL_NAO_ABRE');
    await cofreApi.registrarDigital({
      id: novoId(),
      nome: p.nome,
      credencial_id: p.credencialId,
      prf_sal: b64(p.sal),
      chave_por_digital: cifrar(chave, conta, adContaPrf(dono(), p.credencialId)),
    });
  } finally {
    chave.fill(0);
  }
  lembrarDigitalLocal(p.credencialId);
  digitalPendente.value = null;
  await carregar();
  await listarDigitais();
}

/** Desiste da digital que ficou sem confirmar (a passkey fica no aparelho, sem abrir nada). */
function descartarDigitalPendente(): void {
  digitalPendente.value = null;
}

async function listarDigitais(): Promise<void> {
  digitais.value = await cofreApi.digitais();
}

async function revogarDigital(id: string): Promise<void> {
  exigeRede();
  await cofreApi.revogarDigital(id);
  // Se era a deste navegador, ele deixa de pedir por ela (a lista do estado ainda tem o id da credencial).
  esquecerDigitalLocal(bruto.value?.digitais?.find((d) => d.id === id)?.credencial_id ?? '-');
  await carregar();
  await listarDigitais();
}

/** Palavra-passe nova (troca ou depois do kit). Cofres e itens não mudam. */
async function trocarSenha(nova: string): Promise<void> {
  exigeRede();
  const conta = chaveConta.value;
  if (!conta) throw new Error('TRANCADO');
  const kdf = novosParametrosKdf();
  const mestra = await chaveMestraDe(nova, kdf);
  await cofreApi.trocarSenha({ kdf, chave_por_senha: cifrar(mestra, conta, adContaSenha(dono())) });
  mestra.fill(0);
  await carregar();
}

function trancar(): void {
  void apagarSessao();
  digitalPendente.value = null;
  chaveConta.value?.fill(0);
  for (const c of cofres.value) c.chave.fill(0);
  for (const c of compartilhados.value) c.chave.fill(0);
  chaveConta.value = null;
  cofres.value = [];
  compartilhados.value = [];
  naoVerificados.value = [];
  par.value = null;
  tentouPar = false;
  itens.value = [];
  ilegiveis.value = 0;
}

// --- tranca sozinho depois de um tempo sem uso (5 min a 1 h, escolha do dono, por aparelho). O relógio mora aqui,
// não na página: ir do cofre para os apps e voltar não tranca; só o tempo parado tranca.
export const TEMPOS_TRANCA_MIN = [5, 10, 15, 30, 60] as const;
const CHAVE_TEMPO_TRANCA = 'loginhub.cofre.tranca-min';
function tempoGuardado(): number {
  try {
    const n = Number(localStorage.getItem(CHAVE_TEMPO_TRANCA));
    return (TEMPOS_TRANCA_MIN as readonly number[]).includes(n) ? n : 5;
  } catch {
    return 5;
  }
}
const trancaMin = ref<number>(tempoGuardado());
watch(trancaMin, (min) => {
  try {
    localStorage.setItem(CHAVE_TEMPO_TRANCA, String(min));
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
});
let ultimoUso = Date.now();
const marcarUso = (): void => {
  ultimoUso = Date.now();
};
watch(aberto, (abriu) => {
  if (abriu) marcarUso();
});
if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, marcarUso);
  setInterval(() => {
    if (aberto.value && Date.now() - ultimoUso > trancaMin.value * 60_000) trancar();
  }, 1000);
  // A sessão guardada no aparelho conta o tempo desde o último uso: renova a cada 15 s de uso e ao esconder o app.
  let ultimaRenovacao = 0;
  const renovar = (): void => {
    if (!aberto.value || ultimoUso <= ultimaRenovacao) return;
    ultimaRenovacao = ultimoUso;
    void tocarSessao();
  };
  setInterval(renovar, 15_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') renovar();
  });
  // A rede voltou com o cofre aberto: confere se mudou algo.
  window.addEventListener('online', () => {
    if (aberto.value) void sincronizar().catch(() => undefined);
  });
}

/**
 * Cria (sem `id`) ou regrava um cofre e devolve o id dele. Ícone e cor vão
 * cifrados junto do nome; sem `aparencia`, o cofre fica com a que já tinha.
 */
async function salvarCofre(nome: string, id?: string, aparencia?: Partial<AparenciaCofre> & { imagem?: string | null }): Promise<string> {
  exigeRede();
  const conta = chaveConta.value;
  if (!conta) throw new Error('TRANCADO');
  // Cofre compartilhado comigo não se renomeia: só o dono (o servidor também recusa).
  if (id && compartilhados.value.some((c) => c.id === id)) throw new Error('SO_O_DONO');
  const existente = id ? cofres.value.find((c) => c.id === id) : undefined;
  const cofreId = existente?.id ?? novoId();
  const chave = existente?.chave ?? novaChave();
  const icone = aparencia?.icone ?? existente?.icone;
  const cor = aparencia?.cor ?? existente?.cor;
  // Imagem: `null` tira a que havia; sem o campo, fica a que já estava.
  const imagem = aparencia?.imagem === null ? undefined : (aparencia?.imagem ?? existente?.imagem);
  // Cofre novo entra no fim da ordem do dono (se ele já ordenou algum); o que existe fica onde está.
  const ordens = cofres.value.flatMap((c) => (c.ordem === undefined ? [] : [c.ordem]));
  const ordem = existente ? existente.ordem : ordens.length ? Math.max(...ordens) + 1 : undefined;
  await cofreApi.salvarCofre(cofreId, cifrarJson(conta, dadosDoCofre({ nome: nome.trim(), chave, icone, cor, imagem, ordem }), adCofre(dono(), cofreId)));
  await carregar();
  await abrirTudo();
  // Quem tem o cofre recebe o nome, o ícone e a cor dentro do selo: mudou algum, o selo é refeito.
  if (existente && (existente.nome !== nome.trim() || existente.icone !== icone || existente.cor !== cor)) await atualizarSelos(cofreId);
  return cofreId;
}

/** O que vai cifrado no registro do cofre: nome, chave e, quando existem, ícone, cor, imagem e ordem. */
function dadosDoCofre(c: Omit<CofreAberto, 'id'>): Record<string, string | number> {
  return {
    nome: c.nome,
    chave: b64(c.chave),
    ...(c.icone ? { icone: c.icone } : {}),
    ...(c.cor ? { cor: c.cor } : {}),
    ...(imagemDoCofreValida(c.imagem) ? { imagem: c.imagem } : {}),
    ...(c.ordem === undefined ? {} : { ordem: c.ordem }),
  };
}

/**
 * Grava a ordem dos cofres escolhida na lista: `ids` na ordem nova, com todos
 * os cofres. Só regrava os que mudaram de posição.
 */
async function reordenarCofres(ids: string[]): Promise<void> {
  exigeRede();
  const conta = chaveConta.value;
  if (!conta) throw new Error('TRANCADO');
  if (ids.length !== cofres.value.length || new Set(ids).size !== ids.length) throw new Error('ORDEM_INVALIDA');
  const mudados = ids.flatMap((id, ordem) => {
    const c = cofres.value.find((x) => x.id === id);
    if (!c) throw new Error('COFRE_NAO_ENCONTRADO');
    return c.ordem === ordem ? [] : [{ ...c, ordem }];
  });
  try {
    for (const c of mudados) await cofreApi.salvarCofre(c.id, cifrarJson(conta, dadosDoCofre(c), adCofre(dono(), c.id)));
  } finally {
    // Mesmo se uma gravação falhar no meio, a lista volta a mostrar o que ficou gravado.
    await carregar();
    await abrirTudo();
  }
}

async function apagarCofre(id: string): Promise<void> {
  exigeRede();
  // Cofre compartilhado comigo: quem não é o dono SAI dele, não o apaga.
  if (compartilhados.value.some((c) => c.id === id)) throw new Error('SO_O_DONO');
  await cofreApi.apagarCofre(id);
  await carregar();
  await abrirTudo();
}

/**
 * `anexos` (db/026): ids dos arquivos cifrados que o item cita. Quem anexa sobe os blobs ANTES e passa a lista aqui; os
 * ids que já estavam no item e saíram da lista são apagados pelo servidor. Ausente = não mexe nos anexos.
 */
async function salvarItem(cofreId: string, dados: ItemCofre, id?: string, anexos?: string[]): Promise<void> {
  exigeRede();
  const cofre = acharCofre(cofreId);
  if (!cofre) throw new Error('COFRE_NAO_ENCONTRADO');
  if (cofre.papel === 'leitura') throw new Error('SOMENTE_LEITURA');
  const itemId = id ?? novoId();
  // Mover item de outro cofre: o servidor também confere o selo e a geração do cofre de ORIGEM.
  const origemId = id ? itens.value.find((i) => i.id === id)?.cofre_id : undefined;
  const origem = origemId && origemId !== cofreId ? acharCofre(origemId) : undefined;
  if (origem?.papel === 'leitura') throw new Error('SOMENTE_LEITURA');
  try {
    await cofreApi.salvarItem(itemId, cofreId, cifrarJson(cofre.chave, dados, adItem(cofreId, itemId)), {
      selo: cofre.papel === 'escrita' ? cofre.selo : undefined,
      geracao: cofre.geracao,
      origem: origem ? { selo: origem.papel === 'escrita' ? origem.selo : undefined, geracao: origem.geracao } : undefined,
      anexos,
    });
  } catch (e) {
    await aposChaveGirada(e);
    throw e;
  }
  await carregar();
  await abrirTudo();
}

/** Os cofres próprios e os compartilhados, com o papel (`dono` para os próprios). */
type CofreComPapel = CofreAberto & { papel: CofrePapel | 'dono'; selo?: string };
function acharCofre(id: string): CofreComPapel | undefined {
  const meu = cofres.value.find((c) => c.id === id);
  if (meu) return { ...meu, papel: 'dono' };
  return compartilhados.value.find((c) => c.id === id);
}

/** O servidor recusou a escrita porque a chave do cofre mudou (o dono girou ou refez o selo): baixa o estado novo e avisa. */
async function aposChaveGirada(e: unknown): Promise<void> {
  const r = (e as { response?: { status?: number; data?: { error?: string } } } | null)?.response;
  if (r?.status === 409 && r.data?.error === 'CHAVE_GIRADA') {
    await sincronizar().catch(() => undefined);
    throw new Error('CHAVE_GIRADA');
  }
}

async function apagarItem(id: string): Promise<void> {
  exigeRede();
  const doItem = itens.value.find((i) => i.id === id);
  if (doItem && acharCofre(doItem.cofre_id)?.papel === 'leitura') throw new Error('SOMENTE_LEITURA');
  // Item com chave de entrada: tira a entrada no hub antes (sem a privada ela não serve, mas não fica pendurada).
  const entrada = itens.value.find((i) => i.id === id)?.entrada;
  if (entrada) {
    try {
      await cofreApi.revogarEntrada(entrada.id);
    } catch (e) {
      if ((e as { response?: { status?: number } }).response?.status !== 404) throw e;
    }
  }
  await cofreApi.apagarItem(id);
  await carregar();
  await abrirTudo();
}

// ------------------------------------------------ máquinas do CLI aprovadas pelo navegador (db/017)

/**
 * Busca o pedido que o `hub-pass login` deixou e CONFERE o código com a chave
 * pública que o servidor entregou: se ela tivesse sido trocada no caminho, o
 * código refeito aqui não bateria com o que a máquina mostrou (`PEDIDO_ADULTERADO`).
 */
async function buscarPedidoDeAparelho(codigoDigitado: string): Promise<CofreAparelhoPedido> {
  const codigo = limparCodigo(codigoDigitado);
  const pedido = await cofreApi.pedidoDeAparelho(codigo);
  if (codigoDoPedido(pedido.id, pedido.chave_publica) !== codigo) throw new Error('PEDIDO_ADULTERADO');
  return pedido;
}

/** O selo da máquina: a chave da conta (`cofreIds` nulo) ou só as chaves (e os nomes) dos cofres escolhidos. */
async function acessoPara(aparelhoId: string, chavePublica: string, cofreIds: string[] | null): Promise<CofreAparelhoAcesso> {
  const conta = chaveConta.value;
  if (!conta) throw new Error('TRANCADO');
  const ad = adSelo(dono(), aparelhoId);
  if (cofreIds === null) return { selo: await selar(chavePublica, { tipo: 'conta', chave: b64(conta) }, ad), cofres: null };
  const escolhidos = cofreIds.map((id) => {
    const c = cofres.value.find((x) => x.id === id);
    if (!c) throw new Error('COFRE_NAO_ENCONTRADO');
    return { id: c.id, nome: c.nome, chave: b64(c.chave) };
  });
  return { selo: await selar(chavePublica, { tipo: 'cofres', cofres: escolhidos }, ad), cofres: escolhidos.map((c) => c.id) };
}

/** Aprova a máquina do pedido para os cofres escolhidos (`null` = a conta inteira). Só com o cofre aberto. */
async function aprovarAparelho(pedido: CofreAparelhoPedido, cofreIds: string[] | null): Promise<void> {
  exigeRede();
  const conta = chaveConta.value;
  if (!conta) throw new Error('TRANCADO');
  const acesso = await acessoPara(pedido.id, pedido.chave_publica, cofreIds);
  await cofreApi.aprovarPedido(pedido.id, { ...acesso, prova: provaDoAparelho(conta, dono(), pedido.id, pedido.chave_publica) });
}

/** Muda os cofres de uma máquina aprovada pelo navegador (refaz o selo com os nomes e as chaves de agora). */
async function alterarAcessoDoAparelho(aparelho: CofreAparelho, cofreIds: string[] | null): Promise<void> {
  const conta = chaveConta.value;
  if (!conta) throw new Error('TRANCADO');
  if (!aparelho.chave_publica) throw new Error('APARELHO_ANTIGO');
  // A chave pública vem da lista do servidor: só vale se a prova feita na aprovação conferir (`APARELHO_ADULTERADO`).
  if (aparelho.prova !== provaDoAparelho(conta, dono(), aparelho.id, aparelho.chave_publica)) throw new Error('APARELHO_ADULTERADO');
  await cofreApi.alterarAcesso(aparelho.id, await acessoPara(aparelho.id, aparelho.chave_publica, cofreIds));
}

// ------------------------------------------------ cofre compartilhado (db/022)

/** O pedido de selo de um cofre próprio para um membro: a chave, o que ele precisa para mostrá-lo e o par do dono (que assina a tag). */
function pedidoDeSelo(c: CofreAberto, membro: string, publicaDoMembro: string) {
  if (!par.value) throw new Error('SEM_PAR');
  return { parDoDono: par.value, dono: dono(), membro, publicaDoMembro, cofreId: c.id, chave: b64(c.chave), nome: c.nome, icone: c.icone, cor: c.cor };
}

/** Quem mais abre um cofre PRÓPRIO. */
const membrosDe = (cofreId: string): CofreMembro[] => (bruto.value?.membros ?? []).filter((m) => m.cofre_id === cofreId);

/** O código que esta conta lê para quem a convida conferir (a chave pública dela). `null` até o par existir. */
const meuCodigo = computed(() => (par.value ? codigoDaChave(par.value.publica) : null));
/** Esta conta já tem par de chaves (sem ele não dá para receber um cofre)? */
const podeCompartilhar = computed(() => !!par.value && !offline.value);

/**
 * Procura a conta pelo e-mail e devolve a chave pública dela com o CÓDIGO DE VERIFICAÇÃO: quem convida confere o código
 * com a pessoa por outro canal antes de selar. 404 igual para "não existe" e "não tem cofre".
 */
async function buscarConvidado(email: string): Promise<{ dono: string; chave_publica: string; codigo: string }> {
  exigeRede();
  if (!chaveConta.value) throw new Error('TRANCADO');
  const p = await cofreApi.pessoaPorEmail(email.trim().toLowerCase());
  if (p.dono === dono()) throw new Error('SOU_EU');
  return { ...p, codigo: codigoDaChave(p.chave_publica) };
}

/** Sela o cofre para o convidado e o põe no cofre com o papel escolhido. Só o dono. */
async function convidar(cofreId: string, convidado: { dono: string; chave_publica: string }, papelEscolhido: CofrePapel): Promise<void> {
  exigeRede();
  const conta = chaveConta.value;
  if (!conta) throw new Error('TRANCADO');
  const c = cofres.value.find((x) => x.id === cofreId);
  if (!c) throw new Error('SO_O_DONO');
  if (!par.value) throw new Error('SEM_PAR');
  await cofreApi.convidar(cofreId, {
    membro: convidado.dono,
    chave_publica: convidado.chave_publica,
    chave_selada: await selarCofre(pedidoDeSelo(c, convidado.dono, convidado.chave_publica)),
    papel: papelEscolhido,
    prova: provaDoMembro(conta, dono(), cofreId, convidado.dono, convidado.chave_publica),
  });
  await carregar();
  await abrirTudo();
}

/** Muda o papel de um membro (leitura ↔ escrita). A chave do cofre não muda. */
async function mudarPapel(cofreId: string, membro: string, novo: CofrePapel): Promise<void> {
  exigeRede();
  if (!cofres.value.some((x) => x.id === cofreId)) throw new Error('SO_O_DONO');
  await cofreApi.ajustarMembro(cofreId, membro, { papel: novo });
  await carregar();
  await abrirTudo();
}

/**
 * Gira a chave do cofre: chave nova, nome e itens recifrados, selo novo para quem fica, tudo num pedido só (o servidor
 * aplica numa transação). `remover` tira essa pessoa no mesmo golpe. Quem já copiou uma senha antes continua com ela.
 */
async function girar(cofreId: string, remover: string | null): Promise<void> {
  exigeRede();
  const conta = chaveConta.value;
  if (!conta) throw new Error('TRANCADO');
  // Parte do estado MAIS NOVO: o servidor recusa o giro se os itens ou as pessoas mudaram desde a última leitura.
  await carregar();
  if (offline.value) throw new Error('OFFLINE');
  await abrirTudo();
  const c = cofres.value.find((x) => x.id === cofreId);
  if (!c) throw new Error('SO_O_DONO');
  const brutos = (bruto.value?.itens ?? []).filter((i) => i.cofre_id === cofreId);
  // Item que não abre não tem como ser recifrado: girar assim o perderia.
  if (itens.value.filter((i) => i.cofre_id === cofreId).length !== brutos.length) throw new Error('ITENS_ILEGIVEIS');
  const { chave: _chave, ...registro } = dadosDoCofre(c);
  if (!par.value) throw new Error('SEM_PAR');
  const { chaveNova, giro } = await prepararGiro({
    dono: dono(),
    parDoDono: par.value,
    chaveDaConta: conta,
    cofreId,
    chaveAntiga: c.chave,
    registro,
    itens: brutos.map((i) => ({ id: i.id, dados: i.dados, atualizado_em: String(i.atualizado_em) })),
    membros: membrosDe(cofreId).map((m) => ({ membro: m.membro, chave_publica: m.chave_publica, prova: m.prova })),
    remover,
  });
  chaveNova.fill(0);
  await cofreApi.girarChave(cofreId, giro);
  await carregar();
  await abrirTudo();
}

/** Tira uma pessoa do cofre E gira a chave (ela já viu a chave antiga: só tirar não bastaria). */
const removerMembro = (cofreId: string, membro: string): Promise<void> => girar(cofreId, membro);
/** Gira a chave sem tirar ninguém. */
const girarChave = (cofreId: string): Promise<void> => girar(cofreId, null);

/** A pessoa viu o código novo do dono e confia nele: fixa e reabre. */
async function confiarNoCodigoNovo(donoDoCofreId: string): Promise<void> {
  const r = naoVerificados.value.find((x) => x.dono === donoDoCofreId && x.motivo === 'codigo');
  if (!r?.codigoNovo) return;
  fixarCodigoDoDono(dono(), donoDoCofreId, r.codigoNovo);
  await abrirTudo();
}

/** O membro sai do cofre: perde só o próprio acesso (a chave não gira). */
async function sairDoCofre(cofreId: string): Promise<void> {
  exigeRede();
  if (!compartilhados.value.some((x) => x.id === cofreId)) throw new Error('COFRE_NAO_ENCONTRADO');
  await cofreApi.sairDoCofre(cofreId);
  await carregar();
  await abrirTudo();
}

/**
 * O dono renomeou o cofre (ou mudou ícone/cor): o selo de cada membro leva esse texto, então é refeito. Confere a prova
 * de cada membro antes de selar (`MEMBRO_ADULTERADO` se o servidor trocou a chave pública de alguém).
 */
async function atualizarSelos(cofreId: string): Promise<void> {
  const conta = chaveConta.value;
  const c = cofres.value.find((x) => x.id === cofreId);
  const membros = membrosDe(cofreId);
  if (!conta || !c || membros.length === 0) return;
  let falhou = false;
  for (const m of membros) {
    try {
      if (m.prova !== provaDoMembro(conta, dono(), cofreId, m.membro, m.chave_publica)) throw new Error('MEMBRO_ADULTERADO');
      await cofreApi.ajustarMembro(cofreId, m.membro, {
        papel: m.papel,
        chave_publica: m.chave_publica,
        chave_selada: await selarCofre(pedidoDeSelo(c, m.membro, m.chave_publica)),
        prova: m.prova,
      });
    } catch {
      falhou = true;
    }
  }
  await carregar();
  await abrirTudo();
  if (falhou) throw new Error('SELOS_NAO_ATUALIZADOS');
}

// ------------------------------------------------ entrada pelo cofre (db/016)

/**
 * Guarda no cofre a chave de entrada da conta do pedido: gera o par, prova ao
 * hub que tem a privada (assina o desafio do cadastro) e grava a privada como
 * item do primeiro cofre. Se o item não gravar, a entrada sai do hub.
 */
async function guardarEntrada(passe: string, pedido: CofreEntradaPedido, nome: string): Promise<void> {
  if (!chaveConta.value) throw new Error('TRANCADO');
  const conta = pedido.conta;
  if (pedido.acao !== 'cadastro' || !conta) throw new Error('PASSE_INVALIDO');
  if (!cofres.value.length) await salvarCofre('Geral');
  const alvo = cofres.value[0]; // sempre um cofre PRÓPRIO: `cofres` não inclui os compartilhados
  if (!alvo) throw new Error('COFRE_NAO_ENCONTRADO');
  const { publica, privada } = await novaChaveDeEntrada();
  const id = novoId();
  const assinatura = await assinarEntrada(privada, mensagemDaEntrada('cadastro', pedido.app.id, conta.id, desafioDoPasse(passe)));
  await cofreApi.registrarEntrada({ id, passe, nome: nome.trim().slice(0, 120) || 'Cofre do LoginHUB', chave_publica: publica, assinatura });
  const entrada: EntradaDoItem = { id, app_id: pedido.app.id, app_nome: pedido.app.nome, origem: pedido.app.origem, usuario_id: conta.id, conta: conta.email, privada };
  try {
    await salvarItem(
      alvo.id,
      {
        titulo: `${pedido.app.nome} · entrada pelo cofre`,
        usuario: conta.email,
        senha: '',
        url: pedido.app.origem,
        totp: '',
        notas: `Chave de entrada do ${pedido.app.nome}: o botão "Entrar pelo cofre" do app abre este cofre e ela assina a entrada. Apagar este item tira a entrada.`,
        entrada,
      },
    );
  } catch (e) {
    await cofreApi.revogarEntrada(id).catch(() => undefined);
    throw e;
  }
}

/** Itens com chave de entrada para o app (o cofre precisa estar aberto). */
const entradasDoApp = (appId: number): ItemAberto[] => itens.value.filter((i) => i.entrada?.app_id === appId);

/** Assina a entrada pedida pelo passe com a chave do item. */
async function assinarParaEntrar(item: ItemAberto, passe: string): Promise<{ entrada_id: string; assinatura: string }> {
  const e = item.entrada;
  if (!e) throw new Error('SEM_ENTRADA');
  const assinatura = await assinarEntrada(e.privada, mensagemDaEntrada('entrar', e.app_id, e.usuario_id, desafioDoPasse(passe)));
  return { entrada_id: e.id, assinatura };
}

export function useCofre() {
  return {
    trancaMin,
    offline,
    copiaEm,
    sincronizando,
    sincronizar,
    restaurarSessao,
    exigeRede,
    existe,
    aberto,
    temDigital,
    digitais,
    cofres,
    compartilhados,
    naoVerificados,
    confiarNoCodigoNovo,
    itens,
    ilegiveis,
    carregar,
    criar,
    abrirComSenha,
    conferirSenha,
    provarPresencaComDigital,
    abrirComKit,
    abrirComDigital,
    ativarDigital,
    digitalPendente,
    concluirDigital,
    descartarDigitalPendente,
    listarDigitais,
    revogarDigital,
    trocarSenha,
    trancar,
    salvarCofre,
    reordenarCofres,
    apagarCofre,
    salvarItem,
    apagarItem,
    buscarPedidoDeAparelho,
    aprovarAparelho,
    alterarAcessoDoAparelho,
    guardarEntrada,
    entradasDoApp,
    assinarParaEntrar,
    meuCodigo,
    podeCompartilhar,
    membrosDe,
    buscarConvidado,
    convidar,
    mudarPapel,
    removerMembro,
    girarChave,
    sairDoCofre,
  };
}
