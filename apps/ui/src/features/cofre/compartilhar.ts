/**
 * Cofre compartilhado entre contas (26/11/2026, db/022). TUDO acontece aqui, no navegador: o servidor só guarda
 * texto cifrado e a chave pública de cada conta.
 *
 *   par X25519 da conta ── pública em claro; privada cifrada com a CHAVE DA CONTA (envelope v1, dado "pessoa:<dono>")
 *   compartilhar ────────── o dono decifra a chave do cofre e a SELA para a chave pública do convidado (X25519
 *                           efêmero → HKDF-SHA256 → XChaCha20-Poly1305, "x1.<efêmera>.<nonce>.<cifra>", dado
 *                           associado "cofre-membro-x1:<cofre>:<membro>"). Os itens seguem cifrados com a MESMA
 *                           chave do cofre.
 *   código de verificação ─ sha256 da chave pública do convidado, em 5 grupos de 4 letras: o dono confere por outro
 *                           canal ANTES de selar (o servidor poderia entregar uma chave que não é do convidado).
 *   prova ──────────────── HMAC (chave da conta do dono) de cofre + membro + chave pública, guardado no servidor:
 *                           ao selar de novo, o navegador do dono confere, então o servidor não troca a chave
 *                           do convidado no caminho.
 *   remover alguém ─────── girar a chave: chave nova, nome e TODOS os itens recifrados, selo novo para quem fica.
 *
 * Autenticação do remetente: o selo carrega o dono e uma TAG (HMAC de cofre|membro|dono|chave com chave derivada do DH
 * estático entre a privada do dono e a pública do membro). Só quem tem a privada do dono (ou a do membro) a produz; o
 * membro a confere com a pública do dono e FIXA o código dessa chave (TOFU, `local.ts`): o servidor não forja "cofre de fulano".
 * A pública de cada conta é sempre DERIVADA da privada decifrada, nunca confiada ao servidor.
 *
 * O mesmo padrão do pareamento das máquinas do CLI (pareamento.ts), com outra etiqueta no HKDF para que um selo de
 * máquina nunca sirva como selo de membro. Só @noble e WebCrypto: nada de cripto escrita à mão.
 */
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import type { CofreGiro } from '@loginhub/schema';
import { adCofre, adItem, b64, cifrar, cifrarJson, decifrar, deB64, novaChave, paraBase32 } from './cripto';
import { novoParDoAparelho, type ParDoAparelho } from './pareamento';

const texto = new TextEncoder();
const deTexto = new TextDecoder();

// ------------------------------------------------------------ dados associados

/** Privada da conta cifrada com a chave da conta. */
export const adPessoa = (dono: string, publica: string) => `pessoa:${dono}:${publica}`;
/** Dado associado dos pares criados antes de a pública entrar nele (lido e regravado com o novo). */
const adPessoaAntigo = (dono: string) => `pessoa:${dono}`;
/** Selo de um cofre para um membro: amarra ao cofre, a quem o compartilha e à conta que o abre. */
export const adMembro = (cofreId: string, dono: string, membro: string) => `cofre-membro-x1:${cofreId}:${dono}:${membro}`;

// ------------------------------------------------------------ par X25519 da conta

/** Par novo (X25519 do WebCrypto): `publica` 32 bytes crus em base64, `privada` PKCS#8 em base64. */
export const novoParDaPessoa = (): Promise<ParDoAparelho> => novoParDoAparelho();

/** A pública que corresponde a uma privada PKCS#8 (base64): exporta o JWK da chave e lê o `x`. */
async function publicaDe(privada: string): Promise<string> {
  const pkcs8 = deB64(privada);
  try {
    const k = await crypto.subtle.importKey('pkcs8', pkcs8 as BufferSource, { name: 'X25519' }, true, ['deriveBits']);
    const x = (await crypto.subtle.exportKey('jwk', k)).x;
    if (!x) throw new Error('CHAVE_ERRADA');
    return b64(deB64(x.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (x.length % 4)) % 4)));
  } finally {
    pkcs8.fill(0);
  }
}

/** O que vai ao servidor: a pública em claro e a privada cifrada com a chave da conta (dado associado com a pública). */
export function protegerPar(chaveDaConta: Uint8Array, dono: string, par: ParDoAparelho): { chave_publica: string; chave_privada: string } {
  const pkcs8 = deB64(par.privada);
  try {
    return { chave_publica: par.publica, chave_privada: cifrar(chaveDaConta, pkcs8, adPessoa(dono, par.publica)) };
  } finally {
    pkcs8.fill(0);
  }
}

/**
 * Abre a privada guardada no servidor e DERIVA a pública dela: se a pública que o servidor entrega não for a desta
 * privada, lança `PAR_ADULTERADO` (o servidor trocou a chave para anular o código de verificação). Par antigo (dado
 * associado sem a pública) ainda abre e vem com `regravar`, o registro novo para a tela devolver ao servidor.
 * Lança `CHAVE_ERRADA` se a privada foi mexida ou é de outra conta.
 */
export async function abrirPar(
  chaveDaConta: Uint8Array,
  dono: string,
  registro: { chave_publica: string; chave_privada: string },
): Promise<{ par: ParDoAparelho; regravar?: { chave_publica: string; chave_privada: string } }> {
  let antigo = false;
  let pkcs8: Uint8Array;
  try {
    pkcs8 = decifrar(chaveDaConta, registro.chave_privada, adPessoa(dono, registro.chave_publica));
  } catch {
    pkcs8 = decifrar(chaveDaConta, registro.chave_privada, adPessoaAntigo(dono));
    antigo = true;
  }
  try {
    const privada = b64(pkcs8);
    const publica = await publicaDe(privada);
    if (publica !== registro.chave_publica) throw new Error('PAR_ADULTERADO');
    const par = { publica, privada };
    return antigo ? { par, regravar: protegerPar(chaveDaConta, dono, par) } : { par };
  } finally {
    pkcs8.fill(0);
  }
}

// ------------------------------------------------------------ código de verificação

/**
 * Código que o dono confere com o convidado por outro canal (telefone, conversa): 100 bits do sha256 da chave pública,
 * em 5 grupos de 4 caracteres (base32). Estável: a mesma chave dá sempre o mesmo código, nos dois lados.
 */
export function codigoDaChave(publica: string): string {
  const h = sha256(texto.encode(`loginhub-cofre-pessoa-v1|${publica}`));
  return paraBase32(h.subarray(0, 13)).slice(0, 20).match(/.{4}/g)!.join('-');
}

// ------------------------------------------------------------ selo do cofre

/** O que o selo leva: a chave do cofre, quem o compartilha (com a tag que prova), e o que o membro precisa para mostrá-lo. */
export interface CofreSelado {
  v: 2;
  cofre: string;
  dono: string;
  chave: string;
  nome: string;
  icone?: string;
  cor?: string;
  /** HMAC de cofre|membro|dono|chave com a chave do DH estático dono↔membro (`etiquetaDoRemetente`). */
  tag: string;
}

async function segredo(privada: CryptoKey, publica: Uint8Array): Promise<Uint8Array> {
  const chavePublica = await crypto.subtle.importKey('raw', publica as BufferSource, { name: 'X25519' }, false, []);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'X25519', public: chavePublica }, privada, 256));
}

function chaveDoSelo(compartilhado: Uint8Array, efemera: Uint8Array, doMembro: Uint8Array): Uint8Array {
  const sal = new Uint8Array([...efemera, ...doMembro]);
  return hkdf(sha256, compartilhado, sal, texto.encode('loginhub-cofre-membro-x1'), 32);
}

/**
 * Tag do remetente: HMAC-SHA256 (base64) de cofre|membro|dono|chave, com a chave HKDF do DH ESTÁTICO entre `par` (a
 * privada de um lado) e `publicaDoOutro`. Dono e membro chegam ao mesmo valor (DH(a,B) = DH(b,A)); o servidor, que só
 * conhece as públicas, não consegue produzi-la.
 */
export async function etiquetaDoRemetente(par: ParDoAparelho, publicaDoOutro: string, m: { cofre: string; membro: string; dono: string; chave: string }): Promise<string> {
  const outra = deB64(publicaDoOutro);
  if (outra.length !== 32) throw new Error('CHAVE_PUBLICA_INVALIDA');
  const pkcs8 = deB64(par.privada);
  let dh: Uint8Array;
  try {
    dh = await segredo(await crypto.subtle.importKey('pkcs8', pkcs8 as BufferSource, { name: 'X25519' }, false, ['deriveBits']), outra);
  } finally {
    pkcs8.fill(0);
  }
  const k = hkdf(sha256, dh, undefined, texto.encode('loginhub-cofre-remetente-v1'), 32);
  dh.fill(0);
  try {
    return b64(hmac(sha256, k, texto.encode(`${m.cofre}|${m.membro}|${m.dono}|${m.chave}`)));
  } finally {
    k.fill(0);
  }
}

export interface PedidoDeSelo {
  /** O par do DONO (a privada produz a tag). */
  parDoDono: ParDoAparelho;
  dono: string;
  membro: string;
  publicaDoMembro: string;
  cofreId: string;
  chave: string;
  nome: string;
  icone?: string | undefined;
  cor?: string | undefined;
}

/** Sela o cofre para a chave pública do membro. Lança `CHAVE_PUBLICA_INVALIDA` se ela não tiver 32 bytes. */
export async function selarCofre(p: PedidoDeSelo): Promise<string> {
  const doMembro = deB64(p.publicaDoMembro);
  if (doMembro.length !== 32) throw new Error('CHAVE_PUBLICA_INVALIDA');
  const conteudo: CofreSelado = {
    v: 2,
    cofre: p.cofreId,
    dono: p.dono,
    chave: p.chave,
    nome: p.nome,
    ...(p.icone ? { icone: p.icone } : {}),
    ...(p.cor ? { cor: p.cor } : {}),
    tag: await etiquetaDoRemetente(p.parDoDono, p.publicaDoMembro, { cofre: p.cofreId, membro: p.membro, dono: p.dono, chave: p.chave }),
  };
  const par = (await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits'])) as CryptoKeyPair;
  const efemera = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const compartilhado = await segredo(par.privateKey, doMembro);
  const chave = chaveDoSelo(compartilhado, efemera, doMembro);
  compartilhado.fill(0);
  try {
    const [, nonce, cifra] = cifrar(chave, texto.encode(JSON.stringify(conteudo)), adMembro(p.cofreId, p.dono, p.membro)).split('.');
    return `x1.${b64(efemera)}.${nonce}.${cifra}`;
  } finally {
    chave.fill(0);
  }
}

/** Quem espera receber o selo e de quem: tudo é conferido contra o que o selo diz de si. */
export interface EsperadoDoSelo {
  cofreId: string;
  dono: string;
  membro: string;
  /** Chave pública do dono, como o servidor a entrega: a tag só confere com a privada do dono. */
  publicaDoDono: string;
}

/**
 * Abre o selo com o par da conta e AUTENTICA o remetente. Lança `CHAVE_ERRADA` (não é desta conta, dado associado
 * trocado, adulterado) ou `REMETENTE_NAO_CONFERE` (a tag não bate: o selo não veio de quem diz ser o dono).
 */
export async function abrirCofreSelado(par: ParDoAparelho, selo: string, esperado: EsperadoDoSelo): Promise<CofreSelado> {
  const [versao, efemeraB64, nonce, cifra] = selo.split('.');
  if (versao !== 'x1' || !efemeraB64 || !nonce || !cifra) throw new Error('ENVELOPE_DESCONHECIDO');
  const pkcs8 = deB64(par.privada);
  let compartilhado: Uint8Array;
  try {
    const privada = await crypto.subtle.importKey('pkcs8', pkcs8 as BufferSource, { name: 'X25519' }, false, ['deriveBits']);
    compartilhado = await segredo(privada, deB64(efemeraB64));
  } catch {
    throw new Error('CHAVE_ERRADA');
  } finally {
    pkcs8.fill(0);
  }
  const chave = chaveDoSelo(compartilhado, deB64(efemeraB64), deB64(par.publica));
  compartilhado.fill(0);
  let c: CofreSelado;
  try {
    c = JSON.parse(deTexto.decode(decifrar(chave, `v1.${nonce}.${cifra}`, adMembro(esperado.cofreId, esperado.dono, esperado.membro)))) as CofreSelado;
  } finally {
    chave.fill(0);
  }
  if (c.v !== 2 || typeof c.chave !== 'string' || typeof c.nome !== 'string' || typeof c.tag !== 'string' || c.cofre !== esperado.cofreId || c.dono !== esperado.dono) {
    throw new Error('REMETENTE_NAO_CONFERE');
  }
  const certa = await etiquetaDoRemetente(par, esperado.publicaDoDono, { cofre: c.cofre, membro: esperado.membro, dono: c.dono, chave: c.chave });
  if (!iguais(certa, c.tag)) throw new Error('REMETENTE_NAO_CONFERE');
  return c;
}

/** Comparação sem sair no primeiro byte diferente. */
function iguais(a: string, b: string): boolean {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ------------------------------------------------------------ prova do membro

/**
 * HMAC-SHA256 (base64) de cofre, membro e chave pública, com uma chave derivada da chave da conta do dono. O servidor
 * guarda e devolve; como não tem a chave da conta, não consegue trocar a chave pública de um membro sem a tela notar.
 */
export function provaDoMembro(chaveDaConta: Uint8Array, dono: string, cofreId: string, membro: string, publica: string): string {
  const chave = hkdf(sha256, chaveDaConta, undefined, texto.encode('loginhub-cofre-membro-prova-v1'), 32);
  try {
    return b64(hmac(sha256, chave, texto.encode(`${dono}|${cofreId}|${membro}|${publica}`)));
  } finally {
    chave.fill(0);
  }
}

// ------------------------------------------------------------ girar a chave

export interface MembroDoGiro {
  membro: string;
  chave_publica: string;
  prova: string | null;
}

export interface EntradaDoGiro {
  dono: string;
  /** O par do dono: a privada produz a tag de remetente de cada selo novo. */
  parDoDono: ParDoAparelho;
  chaveDaConta: Uint8Array;
  cofreId: string;
  chaveAntiga: Uint8Array;
  /** O registro do cofre SEM a chave (nome, ícone, cor, imagem, ordem): a chave nova entra aqui. */
  registro: Record<string, string | number>;
  /** TODOS os itens do cofre como o servidor os tem (cifrados com a chave antiga). */
  itens: { id: string; dados: string; atualizado_em: string }[];
  /** Quem tem o cofre hoje (a pessoa a remover também). */
  membros: MembroDoGiro[];
  remover?: string | null;
}

/** Recifra cada item: decifra com a chave antiga e cifra o MESMO conteúdo com a nova (dado associado: cofre + item). Lança `CHAVE_ERRADA` se algum não abrir. */
export function recifrarItens(chaveAntiga: Uint8Array, chaveNova: Uint8Array, cofreId: string, itens: { id: string; dados: string }[]): { id: string; dados: string }[] {
  return itens.map((i) => {
    const claro = decifrar(chaveAntiga, i.dados, adItem(cofreId, i.id));
    try {
      return { id: i.id, dados: cifrar(chaveNova, claro, adItem(cofreId, i.id)) };
    } finally {
      claro.fill(0);
    }
  });
}

/**
 * Monta o corpo de `POST /cofre/cofres/:id/girar-chave`: chave nova, registro e itens recifrados, selo novo para cada
 * membro que FICA. Confere a prova de cada um (`MEMBRO_ADULTERADO` se o servidor trocou a chave pública de alguém).
 * Devolve também a chave nova, para a tela trocá-la na memória depois que o servidor aceitar.
 */
export async function prepararGiro(e: EntradaDoGiro): Promise<{ chaveNova: Uint8Array; giro: CofreGiro }> {
  const ficam = e.membros.filter((m) => m.membro !== e.remover);
  for (const m of ficam) {
    if (m.prova !== provaDoMembro(e.chaveDaConta, e.dono, e.cofreId, m.membro, m.chave_publica)) throw new Error('MEMBRO_ADULTERADO');
  }
  const chaveNova = novaChave();
  const itens = recifrarItens(e.chaveAntiga, chaveNova, e.cofreId, e.itens);
  const dadosDoCofre = cifrarJson(e.chaveDaConta, { ...e.registro, chave: b64(chaveNova) }, adCofre(e.dono, e.cofreId));
  const nome = String(e.registro.nome ?? '');
  const icone = typeof e.registro.icone === 'string' ? e.registro.icone : undefined;
  const cor = typeof e.registro.cor === 'string' ? e.registro.cor : undefined;
  const membros = await Promise.all(
    ficam.map(async (m) => ({
      membro: m.membro,
      chave_publica: m.chave_publica,
      chave_selada: await selarCofre({ parDoDono: e.parDoDono, dono: e.dono, membro: m.membro, publicaDoMembro: m.chave_publica, cofreId: e.cofreId, chave: b64(chaveNova), nome, icone, cor }),
      prova: m.prova as string, // conferida acima
    })),
  );
  const giro: CofreGiro = {
    dados: dadosDoCofre,
    itens: e.itens.map((i, n) => ({ id: i.id, dados: itens[n]!.dados, atualizado_em: i.atualizado_em })),
    membros,
    ...(e.remover ? { remover: e.remover } : {}),
  };
  return { chaveNova, giro };
}
