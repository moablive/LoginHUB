/**
 * Teste da entrada pelo cofre (db/016): a chave que a UI gera e assina
 * (apps/ui/src/features/cofre/entrada.ts, WebCrypto) confere no jeito do hub
 * (PasskeyService.assinaturaConfere: node:crypto com a chave pública crua em JWK).
 *
 *   NODE_PATH=cli/hub-pass/node_modules npx tsx scripts/teste-cofre-entrada.ts
 */
import crypto from 'node:crypto';
import { assinarEntrada, desafioDoPasse, mensagemDaEntrada, novaChaveDeEntrada } from '../apps/ui/src/features/cofre/entrada';

let falhas = 0;
const caso = (nome: string, ok: boolean) => {
  if (!ok) falhas++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}`);
};

// Igual ao PasskeyService (mesmas expressões).
const CHAVE_PUBLICA = /^[A-Za-z0-9_-]{43}$/;
const ASSINATURA = /^[A-Za-z0-9_-]{86}$/;
const confere = (publica: string, mensagem: string, assinatura: string): boolean => {
  if (!ASSINATURA.test(assinatura) || !CHAVE_PUBLICA.test(publica)) return false;
  try {
    const chave = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: publica }, format: 'jwk' });
    return crypto.verify(null, Buffer.from(mensagem, 'utf8'), chave, Buffer.from(assinatura, 'base64url'));
  } catch {
    return false;
  }
};

const passeFalso = (ch: string) => `x.${Buffer.from(JSON.stringify({ action: 'cofre-login', ch })).toString('base64url')}.y`;

async function main(): Promise<void> {
const ch = crypto.randomBytes(32).toString('base64url');
const { publica, privada } = await novaChaveDeEntrada();
caso('chave pública tem 32 bytes em base64url', CHAVE_PUBLICA.test(publica));
caso('desafio sai do passe', desafioDoPasse(passeFalso(ch)) === ch);

const m = mensagemDaEntrada('entrar', 18, 155, ch);
const a = await assinarEntrada(privada, m);
caso('assinatura tem 64 bytes em base64url', ASSINATURA.test(a));
caso('assinatura da UI confere no hub', confere(publica, m, a));
caso('outro app não confere', !confere(publica, mensagemDaEntrada('entrar', 3, 155, ch), a));
caso('outra conta não confere', !confere(publica, mensagemDaEntrada('entrar', 18, 156, ch), a));
caso('cadastro não serve de entrada', !confere(publica, mensagemDaEntrada('cadastro', 18, 155, ch), a));
caso('outro desafio não confere', !confere(publica, mensagemDaEntrada('entrar', 18, 155, crypto.randomBytes(32).toString('base64url')), a));
const outra = await novaChaveDeEntrada();
caso('outra chave não confere', !confere(outra.publica, m, a));
caso('assinatura mexida não confere', !confere(publica, m, (a[0] === 'A' ? 'B' : 'A') + a.slice(1)));
caso('lixo não confere', !confere(publica, m, 'x'.repeat(86)) && !confere('curta', m, a));

console.log(falhas ? `${falhas} falha(s)` : '0 falhas');
process.exit(falhas ? 1 : 0);
}

void main();
