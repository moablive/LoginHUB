import { computed, ref, shallowRef } from 'vue';
import { cofreApi } from '@loginhub/api-client';
import type { CofreDigital, CofreEntradaPedido, CofreEstado } from '@loginhub/schema';
import { randomBytes } from '@noble/ciphers/utils.js';
import type { AparenciaCofre } from './aparencia';
import { criarDigital, pedirSegredo } from './digital';
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
      const d = decifrarJson<{ nome: string; chave: string; icone?: string; cor?: string }>(conta, c.dados, adCofre(dono(), c.id));
      abertos.push({ id: c.id, nome: d.nome, chave: deB64(d.chave), icone: d.icone, cor: d.cor });
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
  abertos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
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
  const { credencialId, segredo } = await pedirSegredo(lista.map((d) => ({ credencial_id: d.credencial_id, prf_sal: deB64(d.prf_sal) })));
  const d = lista.find((x) => x.credencial_id === credencialId);
  if (!d) {
    segredo.fill(0);
    throw new Error('CHAVE_ERRADA');
  }
  const chave = chaveDoPrf(segredo);
  segredo.fill(0);
  try {
    chaveConta.value = decifrar(chave, d.chave_por_digital, adContaPrf(dono(), d.credencial_id));
  } finally {
    chave.fill(0);
  }
  abrirTudo();
  cofreApi.usouDigital(d.id).catch(() => undefined);
}

/** Cadastra a digital deste aparelho (só com o cofre aberto: precisa da chave da conta). */
async function ativarDigital(nome: string): Promise<void> {
  const conta = chaveConta.value;
  if (!conta) throw new Error('TRANCADO');
  const sal = randomBytes(32);
  const { credencialId, segredo } = await criarDigital(dono(), nome, sal);
  const chave = chaveDoPrf(segredo);
  segredo.fill(0);
  try {
    await cofreApi.registrarDigital({
      id: novoId(),
      nome: nome.trim().slice(0, 120) || 'Aparelho',
      credencial_id: credencialId,
      prf_sal: b64(sal),
      chave_por_digital: cifrar(chave, conta, adContaPrf(dono(), credencialId)),
    });
  } finally {
    chave.fill(0);
  }
  await carregar();
  await listarDigitais();
}

async function listarDigitais(): Promise<void> {
  digitais.value = await cofreApi.digitais();
}

async function revogarDigital(id: string): Promise<void> {
  await cofreApi.revogarDigital(id);
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
  const dados = { nome: nome.trim(), chave: b64(chave), ...(icone ? { icone } : {}), ...(cor ? { cor } : {}) };
  await cofreApi.salvarCofre(cofreId, cifrarJson(conta, dados, adCofre(dono(), cofreId)));
  await carregar();
  abrirTudo();
  return cofreId;
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
    listarDigitais,
    revogarDigital,
    trocarSenha,
    trancar,
    salvarCofre,
    apagarCofre,
    salvarItem,
    apagarItem,
    guardarEntrada,
    entradasDoApp,
    assinarParaEntrar,
  };
}
