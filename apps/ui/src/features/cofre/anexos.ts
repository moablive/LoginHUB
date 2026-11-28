/**
 * Anexos cifrados do cofre (27/11/2026, db/026). A foto ou o PDF de um documento é cifrado AQUI, no navegador, com uma
 * chave sorteada só para ele (File Key). A chave, o nome e o tipo do arquivo vão dentro do JSON cifrado do item
 * (`AnexoRef`); o servidor recebe só os bytes cifrados.
 *
 * Blob: [versão 1][nonce 24][cifra XChaCha20-Poly1305 + etiqueta 16]. Dado associado "anexo:<item>:<anexo>" amarra o blob
 * ao item e ao id: o servidor não consegue colar o anexo de um item em outro. (Sem o cofre no dado associado, de
 * propósito: o item pode mudar de cofre e o blob continua abrindo.)
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { cofreApi } from '@loginhub/api-client';
import { novoId } from './cripto';
import { cifrarBytes, conferirRef, decifrarBytes, ErroAnexo, tipoConfere } from './anexosCripto';
import { MAX_ANEXO_BYTES, MIMES_ANEXO, type AnexoRef } from './tipos';

const LADO_MAX = 2000;
const QUALIDADE_JPEG = 0.85;

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export { ErroAnexo };

/** Um arquivo já cifrado, esperando o "Salvar" do item para subir. */
export interface AnexoPendente {
  ref: AnexoRef;
  cifrado: Uint8Array;
}

/**
 * Foto → JPEG reduzido (lado maior 2000 px, qualidade 0,85). Redesenhar no canvas DESCARTA o EXIF (GPS, modelo do celular,
 * data) e aplica a rotação da câmera. PNG transparente ganha fundo branco.
 */
async function reduzirImagem(arquivo: File): Promise<Uint8Array> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    throw new ErroAnexo('IMAGEM', 'Não consegui ler essa imagem. Use JPG, PNG ou WebP.');
  }
  try {
    const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
    const tela = document.createElement('canvas');
    tela.width = Math.max(1, Math.round(bmp.width * escala));
    tela.height = Math.max(1, Math.round(bmp.height * escala));
    const ctx = tela.getContext('2d');
    if (!ctx) throw new ErroAnexo('IMAGEM', 'Este navegador não consegue preparar a imagem.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tela.width, tela.height);
    ctx.drawImage(bmp, 0, 0, tela.width, tela.height);
    const blob = await new Promise<Blob | null>((ok) => tela.toBlob(ok, 'image/jpeg', QUALIDADE_JPEG));
    if (!blob) throw new ErroAnexo('IMAGEM', 'Não consegui preparar a imagem.');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bmp.close();
  }
}

/**
 * Prepara um arquivo para o item `itemId`: confere tipo e tamanho, reduz a foto, sorteia a File Key e cifra. Nada sai do
 * navegador aqui. PDF segue como está (não dá para limpar metadado de PDF no navegador).
 */
export async function prepararAnexo(arquivo: File, itemId: string): Promise<AnexoPendente> {
  if (!(MIMES_ANEXO as readonly string[]).includes(arquivo.type)) throw new ErroAnexo('TIPO', 'Use foto (JPG, PNG, WebP) ou PDF.');
  if (arquivo.size > MAX_ANEXO_BYTES * 3) throw new ErroAnexo('TAMANHO', 'Arquivo grande demais.');
  let bytes: Uint8Array;
  let mime = arquivo.type;
  let nome = arquivo.name || 'arquivo';
  if (arquivo.type === 'application/pdf') {
    bytes = new Uint8Array(await arquivo.arrayBuffer());
    if (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 4)) !== '%PDF') throw new ErroAnexo('PDF', 'Este arquivo não é um PDF válido.');
  } else {
    bytes = await reduzirImagem(arquivo);
    mime = 'image/jpeg';
    nome = nome.replace(/\.[^.]+$/, '') + '.jpg';
  }
  if (bytes.length > MAX_ANEXO_BYTES) throw new ErroAnexo('TAMANHO', 'O arquivo passa de 10 MB.');
  const id = novoId();
  const { cifrado, chave } = cifrarBytes(bytes, itemId, id);
  return { ref: { id, nome, mime, tamanho: bytes.length, chave, sha256: hex(sha256(cifrado)) }, cifrado };
}

/** Sobe os arquivos já cifrados. Se um falhar, apaga os que já subiram (não deixa blob sem item) e repassa o erro. */
export async function enviarAnexos(pendentes: AnexoPendente[], cofreId: string, itemId: string): Promise<void> {
  const subidos: string[] = [];
  try {
    for (const p of pendentes) {
      await cofreApi.enviarAnexo(p.ref.id, cofreId, itemId, p.ref.sha256, p.cifrado);
      subidos.push(p.ref.id);
    }
  } catch (e) {
    await Promise.allSettled(subidos.map((id) => cofreApi.apagarAnexo(id)));
    throw e;
  }
}

/** Desfaz o envio quando o item não chegou a ser gravado depois do upload. */
export async function descartarAnexos(ids: string[]): Promise<void> {
  await Promise.allSettled(ids.map((id) => cofreApi.apagarAnexo(id)));
}

/** Baixa, confere a integridade e decifra um anexo. Devolve os bytes em claro: quem chama os apaga quando fechar. */
export async function abrirAnexo(ref: AnexoRef, itemId: string): Promise<Uint8Array> {
  conferirRef(ref);
  const cifrado = await cofreApi.baixarAnexo(ref.id);
  if (hex(sha256(cifrado)) !== ref.sha256) throw new ErroAnexo('INTEGRIDADE', 'O arquivo guardado foi alterado. Não vou abrir.');
  const claro = decifrarBytes(cifrado, ref.chave, itemId, ref.id);
  if (!tipoConfere(claro, ref.mime)) throw new ErroAnexo('ABRIR', 'O conteúdo do arquivo não é do tipo que o item informa. Não vou abrir.');
  return claro;
}

/** URL temporária só desta aba. Revogue com `URL.revokeObjectURL` ao fechar. */
export const urlTemporaria = (bytes: Uint8Array, mime: string): string => URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
