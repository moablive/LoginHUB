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

export const adAnexo = (itemId: string, anexoId: string): string => `anexo:${itemId}:${anexoId}`;

export class ErroAnexo extends Error {
  constructor(
    public readonly codigo: 'TIPO' | 'TAMANHO' | 'IMAGEM' | 'PDF' | 'INTEGRIDADE' | 'ABRIR',
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroAnexo';
  }
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
