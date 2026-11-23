/**
 * Aprovação de uma máquina do CLI pelo navegador (23/11/2026, db/017, pedido do
 * dono: os outros servidores usam o cofre sem ninguém digitar a Master Key nem a
 * palavra-passe neles; quem aprova é o cofre aberto, com a digital).
 *
 *   máquina (hub-pass login): sorteia um par X25519 e um token, manda ao hub a
 *       chave PÚBLICA e o hash do token e mostra um CÓDIGO de 12 letras;
 *   navegador (cofre aberto): a pessoa digita o código, o hub devolve o pedido e
 *       a tela refaz o código com a chave que recebeu — se o hub trocasse a chave
 *       no caminho, o código não bateria;
 *   selo: a tela cifra PARA a chave pública da máquina o que ela pode abrir — a
 *       chave da conta, ou só as chaves dos cofres escolhidos. Só a privada, que
 *       nunca saiu da máquina, abre.
 *
 * Cifra do selo: X25519 efêmero (WebCrypto) → HKDF-SHA256 (sal = as duas chaves
 * públicas) → XChaCha20-Poly1305 com dados associados (dono e id do aparelho).
 * Formato "x1.<pública efêmera>.<nonce>.<cifra>", tudo em base64.
 *
 * Este arquivo roda igual no navegador e no Node do CLI (crypto.subtle).
 */
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { b64, cifrar, deB64, decifrar, paraBase32 } from './cripto';

const texto = new TextEncoder();
const deTexto = new TextDecoder();

/** O que o selo leva: a conta inteira ou só alguns cofres (com o nome, que a máquina não teria como ler). */
export type ConteudoDoSelo =
  | { tipo: 'conta'; chave: string }
  | { tipo: 'cofres'; cofres: { id: string; nome: string; chave: string }[] };

export interface ParDoAparelho {
  /** Chave pública X25519: 32 bytes crus em base64. */
  publica: string;
  /** Chave privada em PKCS#8, base64. Fica só na máquina (sessao.json, 600). */
  privada: string;
}

/** Dados associados do selo: amarra ao dono do cofre e à máquina. */
export const adSelo = (dono: string, aparelhoId: string) => `cofre-aparelho-x1:${dono}:${aparelhoId}`;

export const pareamentoSuportado = (): boolean => typeof crypto !== 'undefined' && !!crypto.subtle;

export async function novoParDoAparelho(): Promise<ParDoAparelho> {
  const par = (await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits'])) as CryptoKeyPair;
  const publica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const privada = new Uint8Array(await crypto.subtle.exportKey('pkcs8', par.privateKey));
  const r = { publica: b64(publica), privada: b64(privada) };
  privada.fill(0);
  return r;
}

/**
 * Código do pedido: 12 letras base32 (60 bits) do sha256 do id e da chave
 * pública, em grupos de 4. É a MESMA conta do `codigoDoPedido` do CofreService.
 */
export function codigoDoPedido(id: string, publica: string): string {
  const h = sha256(texto.encode(`loginhub-cofre-pedido-v1|${id}|${publica}`));
  return paraBase32(h.subarray(0, 8)).slice(0, 12);
}

/**
 * Prova de que ESTA chave pública foi a aprovada: HMAC-SHA256 (base64) do dono,
 * do id e da chave pública, com uma chave derivada da chave da conta. O hub
 * guarda e devolve na lista; como ele não tem a chave da conta, não consegue
 * trocar a chave pública de uma máquina sem que a tela perceba ao mudar o alcance.
 */
export function provaDoAparelho(chaveDaConta: Uint8Array, dono: string, id: string, publica: string): string {
  const chave = hkdf(sha256, chaveDaConta, undefined, texto.encode('loginhub-cofre-aparelho-prova-v1'), 32);
  try {
    return b64(hmac(sha256, chave, texto.encode(`${dono}|${id}|${publica}`)));
  } finally {
    chave.fill(0);
  }
}

export const formatarCodigo = (codigo: string): string => codigo.match(/.{1,4}/g)?.join('-') ?? codigo;

/** Só as letras do código, em maiúsculas (a pessoa digita com hífen, espaço, minúscula). */
export const limparCodigo = (digitado: string): string => digitado.toUpperCase().replace(/[^A-Z2-7]/g, '');

async function segredo(privada: CryptoKey, publica: Uint8Array): Promise<Uint8Array> {
  const chavePublica = await crypto.subtle.importKey('raw', publica as BufferSource, { name: 'X25519' }, false, []);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'X25519', public: chavePublica }, privada, 256));
}

function chaveDoSelo(compartilhado: Uint8Array, efemera: Uint8Array, daMaquina: Uint8Array): Uint8Array {
  const sal = new Uint8Array([...efemera, ...daMaquina]);
  return hkdf(sha256, compartilhado, sal, texto.encode('loginhub-cofre-aparelho-x1'), 32);
}

/** Cifra `conteudo` para a chave pública da máquina. Lança `CHAVE_PUBLICA_INVALIDA` se ela não tiver 32 bytes. */
export async function selar(publicaDaMaquina: string, conteudo: ConteudoDoSelo, associado: string): Promise<string> {
  const daMaquina = deB64(publicaDaMaquina);
  if (daMaquina.length !== 32) throw new Error('CHAVE_PUBLICA_INVALIDA');
  const par = (await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits'])) as CryptoKeyPair;
  const efemera = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const compartilhado = await segredo(par.privateKey, daMaquina);
  const chave = chaveDoSelo(compartilhado, efemera, daMaquina);
  compartilhado.fill(0);
  try {
    // `cifrar` devolve "v1.<nonce>.<cifra>": o selo troca o prefixo pela versão dele e a chave efêmera.
    const [, nonce, cifra] = cifrar(chave, texto.encode(JSON.stringify(conteudo)), associado).split('.');
    return `x1.${b64(efemera)}.${nonce}.${cifra}`;
  } finally {
    chave.fill(0);
  }
}

/** Abre o selo com a privada da máquina. Lança `CHAVE_ERRADA` se não for dela (ou se foi mexido). */
export async function abrirSelo(par: ParDoAparelho, selo: string, associado: string): Promise<ConteudoDoSelo> {
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
  try {
    return JSON.parse(deTexto.decode(decifrar(chave, `v1.${nonce}.${cifra}`, associado))) as ConteudoDoSelo;
  } finally {
    chave.fill(0);
  }
}
