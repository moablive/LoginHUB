/**
 * Teste do aparelho confiável e da conta do app no cofre (db/021, 24/11/2026), contra a
 * API NO AR, com uma conta de CPF de teste no app 2 criada aqui e apagada no fim (não
 * mexe em conta de ninguém).
 *
 *   npx tsx scripts/teste-aparelho-confiavel.ts        (na raiz do repositório, no awlsrv)
 *
 * Confere: o login completo (CPF + CPF + 2FA) devolve a chave do aparelho; com ela o mesmo
 * aparelho entra só com CPF + CPF; chave errada ou outro aparelho voltam a pedir o código;
 * a conta do app sai com o código 2FA; o "Resetar 2FA" apaga a confiança.
 */
import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';

const API = 'http://localhost:3005/api';
const CPF = '99999999901';
const APP = 2;
const NIVEL_USER = 3;
const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 teste-aparelho-confiavel';
const APARELHO_A = 'teste-confiavel-A-' + randomBytes(8).toString('hex');
const APARELHO_B = 'teste-confiavel-B-' + randomBytes(8).toString('hex');

const sql = (q: string): string =>
  execFileSync('docker', ['exec', '-i', 'server_db_postgres', 'psql', '-U', 'admin_root', '-d', 'login_hub', '-v', 'ON_ERROR_STOP=1', '-At', '-c', q], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const masterKey = (): string => {
  const linha = readFileSync('.env', 'utf8').split('\n').find((l) => l.startsWith('MASTER_API_KEY='));
  if (!linha) throw new Error('MASTER_API_KEY ausente no .env');
  return linha.slice('MASTER_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
};

type Resposta = { status: number; corpo: Record<string, unknown> };
async function pedir(metodo: string, caminho: string, corpo?: unknown, cab: Record<string, string> = {}): Promise<Resposta> {
  const r = await fetch(API + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA_PC, 'Sec-CH-UA-Mobile': '?0', ...cab },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  let c: Record<string, unknown> = {};
  try { c = (await r.json()) as Record<string, unknown>; } catch { /* sem corpo */ }
  return { status: r.status, corpo: c };
}

function totp(segredo: string, deslocamento = 0): string {
  const s = segredo.replace(/\s/g, '').toUpperCase();
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, valor = 0; const out: number[] = [];
  for (const ch of s) { valor = (valor << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((valor >>> (bits - 8)) & 255); bits -= 8; } }
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30) + deslocamento));
  const h = createHmac('sha1', Buffer.from(out)).update(msg).digest();
  const o = h[h.length - 1]! & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
/** O hub recusa o mesmo passo de 30 s duas vezes: espera o próximo. */
const proximoPasso = () => new Promise((r) => setTimeout(r, (30 - (Math.floor(Date.now() / 1000) % 30) + 1) * 1000));

let falhas = 0;
const caso = (nome: string, ok: boolean, extra = '') => { if (!ok) falhas++; console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}${ok || !extra ? '' : ' — ' + extra}`); };
const login = (aparelho: string, confianca?: string) =>
  pedir('POST', '/auth/login', { email: CPF, password: CPF, app_id: String(APP), aparelho_id: aparelho, aparelho_nome: 'Windows · Chrome · teste', ...(confianca ? { aparelho_confianca: confianca } : {}) });

function limpar(): void {
  sql(`delete from usuarios where email = '${CPF}' and app_id = ${APP}`);
  sql(`delete from login_aparelhos where conta = '${CPF}'`);
  sql(`delete from login_bloqueios where alvo = '${CPF}' or detalhe = '${CPF}'`);
}

async function main(): Promise<void> {
  limpar();
  const id = sql(`insert into usuarios (app_id, nivel_acesso_id, nome, email, senha_hash, status) values (${APP}, ${NIVEL_USER}, 'TESTE aparelho confiável (apagar)', '${CPF}', '${bcrypt.hashSync(CPF, 10)}', 'ativo') returning id`).split('\n')[0]!;
  sql(`insert into usuarios_2fa (usuario_id, ativo, obrigatorio) values (${id}, false, true)`);
  try {
    // Enrolamento (como o provisionamento dos QR): login → passe de enrolar → setup → ativar.
    const l0 = await login(APARELHO_A);
    const setupToken = String(l0.corpo.setupToken ?? '');
    caso('conta nova sem 2FA cai no enrolamento', !!setupToken, JSON.stringify(l0.corpo));
    const st = await pedir('POST', '/auth/2fa/setup', {}, { Authorization: 'Bearer ' + setupToken });
    const segredo = String(st.corpo.secret ?? '');
    const at = await pedir('POST', '/auth/2fa/verify-setup', { codigo: totp(segredo) }, { Authorization: 'Bearer ' + setupToken });
    caso('2FA ativado', at.corpo.ativo === true, JSON.stringify(at.corpo));
    await proximoPasso();

    // 1º login completo do aparelho A: pede o código e devolve a chave.
    const l1 = await login(APARELHO_A);
    caso('aparelho novo pede o código', l1.corpo.requires2FA === true, JSON.stringify(l1.corpo));
    const v1 = await pedir('POST', '/auth/2fa/verify', { challengeToken: l1.corpo.challengeToken, codigo: totp(segredo) });
    const chave = String(v1.corpo.aparelho_confianca ?? '');
    caso('login completo devolve a chave do aparelho', /^[A-Za-z0-9_-]{43}$/.test(chave), JSON.stringify(Object.keys(v1.corpo)));
    caso('banco guarda só o hash', sql(`select length(confianca_hash) from usuarios_aparelho where usuario_id = ${id}`) === '64' && !sql(`select confianca_hash from usuarios_aparelho where usuario_id = ${id}`).includes(chave));

    // Mesmo aparelho + chave: CPF + CPF basta.
    const l2 = await login(APARELHO_A, chave);
    caso('aparelho registrado entra só com CPF + CPF', typeof l2.corpo.token === 'string' && !l2.corpo.requires2FA, JSON.stringify(l2.corpo));
    const sessao = String(l2.corpo.token ?? '');

    // Chave errada: volta a pedir o código.
    const l3 = await login(APARELHO_A, randomBytes(32).toString('base64url'));
    caso('chave errada pede o código', l3.corpo.requires2FA === true && !l3.corpo.token, JSON.stringify(l3.corpo));

    // Outro aparelho com a chave do A: não entra (a vaga é do A; e a chave não é dele).
    const l4 = await login(APARELHO_B, chave);
    caso('outro aparelho com a chave do A não entra', !l4.corpo.token, `${l4.status} ${JSON.stringify(l4.corpo)}`);

    // Senha errada com a chave certa: não entra.
    const outraSenha = [...CPF].reverse().join(''); // o CPF de trás para frente: nunca é a senha da conta de teste
    const l5 = await pedir('POST', '/auth/login', { email: CPF, password: outraSenha, app_id: String(APP), aparelho_id: APARELHO_A, aparelho_confianca: chave });
    caso('senha errada não entra mesmo com a chave', l5.status === 401, String(l5.status));
    sql(`delete from login_bloqueios where alvo = '${CPF}' or detalhe = '${CPF}'`);

    // Conta do app no cofre.
    const c = await pedir('GET', '/cofre/conta-do-app', undefined, { Authorization: 'Bearer ' + sessao });
    const conta = (c.corpo.conta ?? null) as { totp?: string; usuario?: string; logo?: string | null } | null;
    caso('conta do app sai com o código 2FA da própria conta', !!conta?.totp?.includes(`secret=${segredo}`) && conta?.usuario === CPF, `${c.status} ${JSON.stringify(c.corpo).slice(0, 120)}`);
    caso('conta do app vem com o logo', !!conta?.logo?.startsWith('data:image/'));
    const semToken = await pedir('GET', '/cofre/conta-do-app');
    caso('conta do app sem sessão é recusada', semToken.status === 401, String(semToken.status));

    // Resetar 2FA apaga a confiança.
    const rs = await pedir('POST', `/admin/users/${id}/reset-2fa`, {}, { 'x-api-key': masterKey() });
    caso('reset do 2FA pelo admin', rs.status === 200, String(rs.status));
    caso('reset apaga a confiança', sql(`select count(*) from usuarios_aparelho where usuario_id = ${id} and confianca_hash is not null`) === '0');
    const l6 = await login(APARELHO_A, chave);
    caso('depois do reset a chave antiga não entra', !l6.corpo.token, JSON.stringify(l6.corpo));
  } finally {
    limpar();
    caso('conta de teste apagada', sql(`select count(*) from usuarios where email = '${CPF}'`) === '0');
  }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => { console.error(e); try { limpar(); } catch { /* nada */ } process.exit(1); });
