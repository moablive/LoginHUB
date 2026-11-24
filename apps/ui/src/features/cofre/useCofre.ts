import { computed, ref, shallowRef } from 'vue';
import { cofreApi } from '@loginhub/api-client';
import type { CofreAparelho, CofreAparelhoAcesso, CofreAparelhoPedido, CofreDigital, CofreEntradaPedido, CofreEstado } from '@loginhub/schema';
import { randomBytes } from '@noble/ciphers/utils.js';
import type { AparenciaCofre } from './aparencia';
import { criarDigital, digitalLocal, esquecerDigitalLocal, lembrarDigitalLocal, pedirSegredo } from './digital';
import { adSelo, codigoDoPedido, limparCodigo, provaDoAparelho, selar } from './pareamento';
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
  /** Posição na lista, escolhida pelo dono (23/11/2026). Sem ela, o cofre vai depois dos ordenados, por nome. */
  ordem?: number;
}

export interface ItemCofre {
  titulo: string;
  usuario: string;
  senha: string;
  url: string;
  /** Chave base32 ou URI otpauth:// do 2FA do site. */
  totp: string;
  notas: string;
  /** Item que guarda a chave de entrada de uma conta de app (db/016). */
  entrada?: EntradaDoItem;
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
const itens = ref<ItemAberto[]>([]);
/** Quantos registros não abriram (corrompidos ou mexidos no servidor). */
const ilegiveis = ref(0);

const aberto = computed(() => chaveConta.value !== null);
const existe = computed(() => !!bruto.value?.conta);
/** Alguma digital (passkey com PRF) abre este cofre? A tela trancada mostra o botão. */
const temDigital = computed(() => (bruto.value?.digitais?.length ?? 0) > 0);
const digitais = ref<CofreDigital[]>([]);

async function carregar(): Promise<void> {
  bruto.value = await cofreApi.estado();
}

function abrirTudo(): void {
  const conta = chaveConta.value;
  const estado = bruto.value;
  if (!conta || !estado) return;
  let falhas = 0;
  const abertos: CofreAberto[] = [];
  for (const c of estado.cofres) {
    try {
      const d = decifrarJson<{ nome: string; chave: string; icone?: string; cor?: string; ordem?: number }>(conta, c.dados, adCofre(dono(), c.id));
      abertos.push({ id: c.id, nome: d.nome, chave: deB64(d.chave), icone: d.icone, cor: d.cor, ordem: typeof d.ordem === 'number' ? d.ordem : undefined });
    } catch {
      falhas++;
    }
  }
  const lista: ItemAberto[] = [];
  for (const i of estado.itens) {
    const cofre = abertos.find((c) => c.id === i.cofre_id);
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
  // Primeiro os que o dono pôs em ordem; os outros (cofre antigo, criado pelo CLI) depois, por nome.
  abertos.sort((a, b) => (a.ordem ?? Infinity) - (b.ordem ?? Infinity) || a.nome.localeCompare(b.nome, 'pt-BR'));
  lista.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
  cofres.value = abertos;
  itens.value = lista;
  ilegiveis.value = falhas;
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
  const conta = bruto.value?.conta;
  if (!conta) throw new Error('SEM_COFRE');
  const mestra = await chaveMestraDe(palavraPasse, conta.kdf);
  try {
    chaveConta.value = decifrar(mestra, conta.chave_por_senha, adContaSenha(dono()));
  } finally {
    mestra.fill(0);
  }
  abrirTudo();
}

/** Abre pelo kit de recuperação. Depois disso a tela pede uma palavra-passe nova. */
async function abrirComKit(kitTexto: string): Promise<void> {
  await carregar();
  const conta = bruto.value?.conta;
  if (!conta) throw new Error('SEM_COFRE');
  const kit = kitDeTexto(kitTexto);
  chaveConta.value = decifrar(chaveDoKit(kit), conta.chave_por_kit, adContaKit(dono()));
  kit.fill(0);
  abrirTudo();
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
  abrirTudo();
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
  await cofreApi.revogarDigital(id);
  // Se era a deste navegador, ele deixa de pedir por ela (a lista do estado ainda tem o id da credencial).
  esquecerDigitalLocal(bruto.value?.digitais?.find((d) => d.id === id)?.credencial_id ?? '-');
  await carregar();
  await listarDigitais();
}

/** Palavra-passe nova (troca ou depois do kit). Cofres e itens não mudam. */
async function trocarSenha(nova: string): Promise<void> {
  const conta = chaveConta.value;
  if (!conta) throw new Error('TRANCADO');
  const kdf = novosParametrosKdf();
  const mestra = await chaveMestraDe(nova, kdf);
  await cofreApi.trocarSenha({ kdf, chave_por_senha: cifrar(mestra, conta, adContaSenha(dono())) });
  mestra.fill(0);
  await carregar();
}

function trancar(): void {
  digitalPendente.value = null;
  chaveConta.value?.fill(0);
  for (const c of cofres.value) c.chave.fill(0);
  chaveConta.value = null;
  cofres.value = [];
  itens.value = [];
  ilegiveis.value = 0;
}

/**
 * Cria (sem `id`) ou regrava um cofre e devolve o id dele. Ícone e cor vão
 * cifrados junto do nome; sem `aparencia`, o cofre fica com a que já tinha.
 */
async function salvarCofre(nome: string, id?: string, aparencia?: Partial<AparenciaCofre>): Promise<string> {
  const conta = chaveConta.value;
  if (!conta) throw new Error('TRANCADO');
  const existente = id ? cofres.value.find((c) => c.id === id) : undefined;
  const cofreId = existente?.id ?? novoId();
  const chave = existente?.chave ?? novaChave();
  const icone = aparencia?.icone ?? existente?.icone;
  const cor = aparencia?.cor ?? existente?.cor;
  // Cofre novo entra no fim da ordem do dono (se ele já ordenou algum); o que existe fica onde está.
  const ordens = cofres.value.flatMap((c) => (c.ordem === undefined ? [] : [c.ordem]));
  const ordem = existente ? existente.ordem : ordens.length ? Math.max(...ordens) + 1 : undefined;
  await cofreApi.salvarCofre(cofreId, cifrarJson(conta, dadosDoCofre({ nome: nome.trim(), chave, icone, cor, ordem }), adCofre(dono(), cofreId)));
  await carregar();
  abrirTudo();
  return cofreId;
}

/** O que vai cifrado no registro do cofre: nome, chave e, quando existem, ícone, cor e ordem. */
function dadosDoCofre(c: Omit<CofreAberto, 'id'>): Record<string, string | number> {
  return {
    nome: c.nome,
    chave: b64(c.chave),
    ...(c.icone ? { icone: c.icone } : {}),
    ...(c.cor ? { cor: c.cor } : {}),
    ...(c.ordem === undefined ? {} : { ordem: c.ordem }),
  };
}

/**
 * Grava a ordem dos cofres escolhida na lista: `ids` na ordem nova, com todos
 * os cofres. Só regrava os que mudaram de posição.
 */
async function reordenarCofres(ids: string[]): Promise<void> {
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
    abrirTudo();
  }
}

async function apagarCofre(id: string): Promise<void> {
  await cofreApi.apagarCofre(id);
  await carregar();
  abrirTudo();
}

async function salvarItem(cofreId: string, dados: ItemCofre, id?: string): Promise<void> {
  const cofre = cofres.value.find((c) => c.id === cofreId);
  if (!cofre) throw new Error('COFRE_NAO_ENCONTRADO');
  const itemId = id ?? novoId();
  await cofreApi.salvarItem(itemId, cofreId, cifrarJson(cofre.chave, dados, adItem(cofreId, itemId)));
  await carregar();
  abrirTudo();
}

async function apagarItem(id: string): Promise<void> {
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
  abrirTudo();
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
  const alvo = cofres.value[0];
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
    existe,
    aberto,
    temDigital,
    digitais,
    cofres,
    itens,
    ilegiveis,
    carregar,
    criar,
    abrirComSenha,
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
  };
}
