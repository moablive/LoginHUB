/**
 * Entrada pelo cofre (19/11/2026, db/016, pedido do dono: a biometria do
 * Escritórios 3D mora no próprio cofre do LoginHUB, não numa passkey do Proton
 * Pass ou da Apple).
 *
 * A chave de entrada é um par Ed25519 gerado aqui (WebCrypto). A privada vai
 * cifrada como item do cofre — só abre junto com o cofre (palavra-passe, kit ou
 * a digital do cofre) — e a pública vai para o hub. Para entrar, o cofre aberto
 * assina a linha de `mensagemDaEntrada` (igual à do PasskeyService) com o
 * desafio de uso único que o app pediu.
 */
import { b64url, deB64url } from './digital';

/** Fica dentro do item do cofre (cifrado). */
export interface EntradaDoItem {
  /** id da entrada no hub (cofre_entradas.id) */
  id: string;
  app_id: number;
  app_nome: string;
  origem: string;
  usuario_id: number;
  conta: string;
  /** chave privada Ed25519 em PKCS#8, base64url */
  privada: string;
}

export const mensagemDaEntrada = (acao: 'cadastro' | 'entrar', appId: number, usuarioId: number, desafio: string): string =>
  `loginhub-cofre-entrada-v1|${acao}|${appId}|${usuarioId}|${desafio}`;

/** O desafio viaja dentro do passe (JWT do hub): lê sem conferir — quem confere é o hub. */
export function desafioDoPasse(passe: string): string {
  const meio = passe.split('.')[1];
  if (!meio) throw new Error('PASSE_INVALIDO');
  const dados = JSON.parse(new TextDecoder().decode(deB64url(meio))) as { ch?: unknown };
  if (typeof dados.ch !== 'string' || !dados.ch) throw new Error('PASSE_INVALIDO');
  return dados.ch;
}

export const entradaSuportada = (): boolean => typeof crypto !== 'undefined' && !!crypto.subtle;

/** Par novo: `{ publica }` (32 bytes crus, base64url) e `{ privada }` (PKCS#8, base64url). */
export async function novaChaveDeEntrada(): Promise<{ publica: string; privada: string }> {
  const par = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const publica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const privada = new Uint8Array(await crypto.subtle.exportKey('pkcs8', par.privateKey));
  const r = { publica: b64url(publica), privada: b64url(privada) };
  privada.fill(0);
  return r;
}

/** Assina a linha com a privada do item; devolve a assinatura em base64url (64 bytes). */
export async function assinarEntrada(privada: string, mensagem: string): Promise<string> {
  const bytes = deB64url(privada);
  try {
    const chave = await crypto.subtle.importKey('pkcs8', bytes as BufferSource, { name: 'Ed25519' }, false, ['sign']);
    const assinatura = await crypto.subtle.sign({ name: 'Ed25519' }, chave, new TextEncoder().encode(mensagem) as BufferSource);
    return b64url(new Uint8Array(assinatura));
  } finally {
    bytes.fill(0);
  }
}
