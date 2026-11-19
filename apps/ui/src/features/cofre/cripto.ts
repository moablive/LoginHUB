/**
 * Criptografia do cofre de senhas (19/11/2026). TUDO acontece aqui, no
 * navegador: o servidor só recebe e devolve texto cifrado.
 *
 *   palavra-passe ──Argon2id──► chave mestra ──abre──► chave da conta
 *   kit de recuperação (256 bits) ─────────────abre──► chave da conta
 *   chave da conta ──abre──► { nome, chave } de cada cofre
 *   chave do cofre ──abre──► cada item (título, usuário, senha, URL, 2FA, notas)
 *
 * Cifra: XChaCha20-Poly1305 (nonce de 24 bytes sorteado a cada gravação), com
 * DADOS ASSOCIADOS que amarram o texto ao lugar dele (dono, id do cofre, id do
 * item): o servidor não consegue trocar um item de cofre nem de dono sem que a
 * abertura falhe. Envelope versionado "v1.<nonce>.<cifra>" para poder trocar de
 * algoritmo no futuro sem perder o que já existe.
 *
 * Bibliotecas auditadas (@noble), nada de cripto escrita à mão.
 */
import { argon2idAsync } from '@noble/hashes/argon2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha1 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import type { CofreKdf } from '@loginhub/schema';

const texto = new TextEncoder();
const deTexto = new TextDecoder();

// ------------------------------------------------------------ base64 e base32

export function b64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

export function deB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const ALFABETO32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function paraBase32(bytes: Uint8Array): string {
  let bits = 0;
  let valor = 0;
  let out = '';
  for (const b of bytes) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALFABETO32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALFABETO32[(valor << (5 - bits)) & 31];
  return out;
}

/** Base32 (RFC 4648) tolerante: ignora espaço, hífen, `=` e caixa. Lança se tiver caractere inválido. */
export function deBase32(s: string): Uint8Array {
  const limpo = s.toUpperCase().replace(/[\s=-]/g, '');
  const out: number[] = [];
  let bits = 0;
  let valor = 0;
  for (const c of limpo) {
    const i = ALFABETO32.indexOf(c);
    if (i < 0) throw new Error('BASE32_INVALIDO');
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

// ------------------------------------------------------------ envelope v1

export function cifrar(chave: Uint8Array, dados: Uint8Array, associado: string): string {
  const nonce = randomBytes(24);
  const cifra = xchacha20poly1305(chave, nonce, texto.encode(associado)).encrypt(dados);
  return `v1.${b64(nonce)}.${b64(cifra)}`;
}

/** Lança `CHAVE_ERRADA` se a chave não abre (ou se o texto foi mexido / trocado de lugar). */
export function decifrar(chave: Uint8Array, envelope: string, associado: string): Uint8Array {
  const [versao, nonce, cifra] = envelope.split('.');
  if (versao !== 'v1' || !nonce || !cifra) throw new Error('ENVELOPE_DESCONHECIDO');
  try {
    return xchacha20poly1305(chave, deB64(nonce), texto.encode(associado)).decrypt(deB64(cifra));
  } catch {
    throw new Error('CHAVE_ERRADA');
  }
}

export const cifrarJson = (chave: Uint8Array, valor: unknown, associado: string): string =>
  cifrar(chave, texto.encode(JSON.stringify(valor)), associado);

export const decifrarJson = <T>(chave: Uint8Array, envelope: string, associado: string): T =>
  JSON.parse(deTexto.decode(decifrar(chave, envelope, associado))) as T;

// ------------------------------------------------------------ palavra-passe e kit

/**
 * Argon2id: 64 MiB, 3 passadas (o mínimo recomendado pela OWASP é 19 MiB/2).
 * Leva 1–3 s de propósito: é o que torna caro adivinhar a palavra-passe com o
 * banco roubado na mão.
 */
export function novosParametrosKdf(): CofreKdf {
  return { alg: 'argon2id', t: 3, m: 65536, p: 1, salt: b64(randomBytes(16)) };
}

export function chaveMestraDe(palavraPasse: string, kdf: CofreKdf): Promise<Uint8Array> {
  return argon2idAsync(texto.encode(palavraPasse.normalize('NFKC')), deB64(kdf.salt), {
    t: kdf.t,
    m: kdf.m,
    p: kdf.p,
    dkLen: 32,
  });
}

/** Kit de recuperação: 256 bits sorteados, mostrados em base32 em grupos de 4. */
export function novoKit(): { bytes: Uint8Array; texto: string } {
  const bytes = randomBytes(32);
  const t = paraBase32(bytes).match(/.{1,4}/g)!.join('-');
  return { bytes, texto: t };
}

export function kitDeTexto(t: string): Uint8Array {
  const b = deBase32(t);
  if (b.length !== 32) throw new Error('KIT_INVALIDO');
  return b;
}

/** A chave que embrulha a chave da conta pelo kit (o kit cru nunca é usado direto como chave). */
export const chaveDoKit = (kit: Uint8Array): Uint8Array => sha256(new Uint8Array([...texto.encode('loginhub-cofre-kit-v1'), ...kit]));

export const novaChave = (): Uint8Array => randomBytes(32);

export const novoId = (): string => crypto.randomUUID();

// ------------------------------------------------------------ dados associados

export const adContaSenha = (dono: string) => `cofre-conta:${dono}:senha`;
export const adContaKit = (dono: string) => `cofre-conta:${dono}:kit`;
export const adCofre = (dono: string, id: string) => `cofre:${dono}:${id}`;
export const adItem = (cofreId: string, id: string) => `cofre-item:${cofreId}:${id}`;

// ------------------------------------------------------------ 2FA (TOTP, RFC 6238)

export interface Totp {
  segredo: Uint8Array;
  digitos: number;
  periodo: number;
}

/** Aceita a chave base32 ("JBSW Y3DP…") ou a URI inteira do QR ("otpauth://totp/…?secret=…"). */
export function lerTotp(entrada: string): Totp | null {
  const s = entrada.trim();
  if (!s) return null;
  try {
    if (s.toLowerCase().startsWith('otpauth://')) {
      const u = new URL(s);
      const segredo = u.searchParams.get('secret');
      if (!segredo) return null;
      const digitos = Number(u.searchParams.get('digits') || 6);
      const periodo = Number(u.searchParams.get('period') || 30);
      return { segredo: deBase32(segredo), digitos: digitos === 8 ? 8 : 6, periodo: periodo > 0 && periodo <= 300 ? periodo : 30 };
    }
    const segredo = deBase32(s);
    return segredo.length >= 10 ? { segredo, digitos: 6, periodo: 30 } : null;
  } catch {
    return null;
  }
}

export function codigoTotp(t: Totp, agoraMs = Date.now()): string {
  const contador = Math.floor(agoraMs / 1000 / t.periodo);
  const msg = new Uint8Array(8);
  let c = contador;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 255;
    c = Math.floor(c / 256);
  }
  const h = hmac(sha1, t.segredo, msg);
  const o = h[h.length - 1]! & 15;
  const bin = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(bin % 10 ** t.digitos).padStart(t.digitos, '0');
}

export const segundosRestantes = (t: Totp, agoraMs = Date.now()): number => t.periodo - (Math.floor(agoraMs / 1000) % t.periodo);

// ------------------------------------------------------------ gerador de senha

const CONJUNTO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*-_=+?';

/** Senha aleatória sem viés (rejeição de bytes acima do múltiplo do alfabeto). */
export function gerarSenha(tamanho = 24): string {
  const limite = 256 - (256 % CONJUNTO.length);
  let out = '';
  while (out.length < tamanho) {
    for (const b of randomBytes(tamanho * 2)) {
      if (b < limite && out.length < tamanho) out += CONJUNTO[b % CONJUNTO.length];
    }
  }
  return out;
}
