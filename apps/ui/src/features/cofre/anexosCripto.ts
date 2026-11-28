/**
 * A cifra dos anexos do cofre (28/11/2026, db/026), sem navegador nem rede: só @noble. Arquivo à parte para o teste
 * (scripts/teste-cofre-tipos.ts) rodar no Node sem puxar o cliente da API, que depende do Vite.
 *
 * Blob: [versão 1][nonce 24][cifra XChaCha20-Poly1305 + etiqueta 16]. Dado associado "anexo:<item>:<anexo>" amarra o blob
 * ao item e ao id: o servidor não consegue colar o anexo de um item em outro. (Sem o cofre no dado associado, de
 * propósito: o item pode mudar de cofre e o blob continua abrindo.)
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { b64, deB64 } from './cripto';

export const VERSAO_BLOB = 1;
const VERSAO = VERSAO_BLOB;
const texto = new TextEncoder();

// A versão do blob entra no dado associado: um blob "v1" não vira "v2" por troca do primeiro byte (sem downgrade no futuro).
export const adAnexo = (itemId: string, anexoId: string): string => `anexo:v${VERSAO}:${itemId}:${anexoId}`;

export class ErroAnexo extends Error {
  constructor(
    public readonly codigo: 'TIPO' | 'TAMANHO' | 'IMAGEM' | 'PDF' | 'INTEGRIDADE' | 'ABRIR',
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroAnexo';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/**
 * O `AnexoRef` vem de dentro do item cifrado, mas quem escreve num cofre compartilhado pode gravar qualquer coisa ali: o id
 * entra em URL e o mime decide como o arquivo é aberto. Confere a forma antes de usar. Lança `ErroAnexo('ABRIR')`.
 */
export function conferirRef(r: { id?: unknown; mime?: unknown; sha256?: unknown; chave?: unknown; tamanho?: unknown }): void {
  const ruim = (): never => {
    throw new ErroAnexo('ABRIR', 'A referência deste arquivo está inválida.');
  };
  if (typeof r.id !== 'string' || !UUID.test(r.id)) ruim();
  if (typeof r.mime !== 'string' || !MIMES.includes(r.mime)) ruim();
  if (typeof r.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(r.sha256)) ruim();
  if (typeof r.chave !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(r.chave)) ruim();
  if (typeof r.tamanho !== 'number' || !Number.isFinite(r.tamanho)) ruim();
}

/** Confere se os primeiros bytes do arquivo decifrado são do tipo que o item diz (PDF, JPEG, PNG, WebP). */
export function tipoConfere(bytes: Uint8Array, mime: string): boolean {
  const b = (i: number): number => bytes[i] ?? -1;
  if (mime === 'application/pdf') return b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46;
  if (mime === 'image/jpeg') return b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff;
  if (mime === 'image/png') return b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47;
  if (mime === 'image/webp') return b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50;
  return false;
}

/**
 * A cifra em si, sem navegador: sorteia a File Key e o nonce e devolve o blob `[1][nonce][cifra]` e a chave em base64
 * (que vai para o item). Exportada para o teste (scripts/teste-cofre-tipos.ts).
 */
export function cifrarBytes(bytes: Uint8Array, itemId: string, anexoId: string): { cifrado: Uint8Array; chave: string } {
  const chave = randomBytes(32);
  const nonce = randomBytes(24);
  const cifra = xchacha20poly1305(chave, nonce, texto.encode(adAnexo(itemId, anexoId))).encrypt(bytes);
  const cifrado = new Uint8Array(1 + nonce.length + cifra.length);
  cifrado[0] = VERSAO;
  cifrado.set(nonce, 1);
  cifrado.set(cifra, 1 + nonce.length);
  // A File Key vai para o item (cifrado pela chave do cofre); a cópia em memória daqui é zerada logo depois de lida.
  const chaveB64 = b64(chave);
  chave.fill(0);
  return { cifrado, chave: chaveB64 };
}

/** O inverso de `cifrarBytes`. Lança `ErroAnexo('INTEGRIDADE')` se o blob foi mexido, é de outro item/anexo ou a chave não serve. */
export function decifrarBytes(cifrado: Uint8Array, chaveB64: string, itemId: string, anexoId: string): Uint8Array {
  if (cifrado[0] !== VERSAO || cifrado.length < 41) throw new ErroAnexo('ABRIR', 'Formato de arquivo desconhecido.');
  const chave = deB64(chaveB64);
  try {
    return xchacha20poly1305(chave, cifrado.subarray(1, 25), texto.encode(adAnexo(itemId, anexoId))).decrypt(cifrado.subarray(25));
  } catch {
    throw new ErroAnexo('INTEGRIDADE', 'Não consegui abrir o arquivo (chave ou item não conferem).');
  } finally {
    chave.fill(0);
  }
}
