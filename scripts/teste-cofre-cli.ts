// Teste ponta a ponta do cofre de usuário + CLI hub-pass (db/014). Mexe só no que cria e apaga tudo no fim.
// Rodar (no servidor, com a API em localhost:3005):
//   LOGINHUB_MASTER_KEY=… npx tsx scripts/teste-cofre-cli.ts   (depois de cli/hub-pass/build.sh)
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as c from '../apps/ui/src/features/cofre/cripto';

const API = process.env.LOGINHUB_API || 'http://localhost:3005/api';
const KEY = process.env.LOGINHUB_MASTER_KEY || '';
const CLI = join(__dirname, '..', 'cli', 'hub-pass', 'dist', 'hub-pass.mjs');
let falhas = 0;
const ok = (nome: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'OK   ' : 'FALHA'} ${nome}${extra ? ` (${extra})` : ''}`);
  if (!cond) falhas++;
};

async function http(metodo: string, caminho: string, corpo?: unknown, cab: Record<string, string> = {}) {
  const r = await fetch(API + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...cab },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  return { status: r.status, dados: (await r.json().catch(() => ({}))) as any };
}
const M = { 'x-api-key': KEY };
const totpDe = (segredo: string) => c.codigoTotp(c.lerTotp(segredo)!);
const esperarProximoCodigo = () => new Promise((r) => setTimeout(r, (30 - (Math.floor(Date.now() / 1000) % 30) + 1) * 1000));

(async () => {
  if (!KEY) throw new Error('LOGINHUB_MASTER_KEY ausente');
  const painel = (await http('GET', '/admin/apps', undefined, M)).dados.find((a: any) => a.painelDoHub);
  const email = `teste-cofre-${Date.now()}@teste.local`;
  const senha = `T${c.gerarSenha(16)}!`;
  const palavra = 'teste-cavalo-azul-pavilhao';
  const dir = mkdtempSync(join(tmpdir(), 'hub-pass-'));
  let usuarioId = '';
  const liberadoAntes = painel.cofreLiberado === true;

  try {
    // conta de teste com 2FA
    usuarioId = (await http('POST', '/admin/users', { app_id: String(painel.id), nome: 'Teste Cofre', email, password: senha, role: 'admin' }, M)).dados.user.id;
    const setup = (await http('POST', '/auth/login', { email, password: senha, app_id: String(painel.id) })).dados.setupToken;
    const segredo = (await http('POST', '/auth/2fa/setup', {}, { Authorization: `Bearer ${setup}` })).dados.secret;
    let sessao = (await http('POST', '/auth/2fa/verify-setup', { codigo: totpDe(segredo) }, { Authorization: `Bearer ${setup}` })).dados.token;
    const B = { Authorization: `Bearer ${sessao}` };

    ok('cofre fechado enquanto o app não libera', (await http('GET', '/cofre', undefined, B)).status === 403);
    await http('PUT', `/admin/apps/${painel.id}`, { nome: painel.nome, email: painel.email, documento: painel.documento, cofre_liberado: true }, M);
    const est = (await http('GET', '/cofre', undefined, B)).dados;
    ok('app liberado: o dono é u:<id>', est.dono === `u:${usuarioId}` && est.conta === null, est.dono);

    // cria o cofre como a tela faria
    const kdf = c.novosParametrosKdf();
    const mestra = await c.chaveMestraDe(palavra, kdf);
    const conta = c.novaChave();
    const kit = c.novoKit();
    ok('criar conta do cofre', (await http('POST', '/cofre/conta', {
      kdf,
      chave_por_senha: c.cifrar(mestra, conta, c.adContaSenha(est.dono)),
      chave_por_kit: c.cifrar(c.chaveDoKit(kit.bytes), conta, c.adContaKit(est.dono)),
    }, B)).status === 201);
    const cofreId = c.novoId();
    const chaveCofre = c.novaChave();
    await http('PUT', `/cofre/cofres/${cofreId}`, { dados: c.cifrarJson(conta, { nome: 'SERVIDORES', chave: c.b64(chaveCofre) }, c.adCofre(est.dono, cofreId)) }, B);
    const itemId = c.novoId();
    const segredoSite = 'JBSWY3DPEHPK3PXP';
    await http('PUT', `/cofre/itens/${itemId}`, {
      cofre_id: cofreId,
      dados: c.cifrarJson(chaveCofre, { titulo: 'awlsrv sudo', usuario: 'awlsrv', senha: 'segredo-123', url: '', totp: segredoSite, notas: '' }, c.adItem(cofreId, itemId)),
    }, B);
    ok('master não vê o cofre do usuário', (await http('GET', '/cofre', undefined, M)).dados.dono === 'master');

    // CLI: login (e-mail, senha, código 2FA, palavra-passe) por pipe
    await esperarProximoCodigo();
    const env = { ...process.env, HUB_PASS_CONFIG: dir };
    const cli = (args: string[], entrada = '', extraEnv: Record<string, string> = {}) =>
      spawnSync('node', [CLI, ...args], { input: entrada, env: { ...env, ...extraEnv }, encoding: 'utf8' });
    const l = cli(['login', '--api', API, '--email', email, '--nome', 'teste-ci'], `${senha}\n${totpDe(segredo)}\n${palavra}\n`);
    ok('hub-pass login aprova a máquina', l.status === 0, (l.stderr || '').trim().split('\n').pop());
    ok('sessão gravada com permissão 600', (statSync(join(dir, 'sessao.json')).mode & 0o777) === 0o600);

    const v = cli(['item', 'view', '--vault', 'servidores', '--item', 'awlsrv sudo', '--field', 'password']);
    ok('item view --field password', v.stdout === 'segredo-123', v.stderr.trim());
    const t = cli(['item', 'totp', '--vault-name', 'SERVIDORES', '--item-title', 'awlsrv sudo']);
    ok('item totp (nomes do pass-cli)', t.stdout.trim() === totpDe(segredoSite), t.stdout.trim());
    ok('vault create', cli(['vault', 'create', 'Bancos']).status === 0);
    const cr = cli(['item', 'create', '--vault', 'Bancos', '--title', 'Banco X', '--username', 'eu', '--generate=20']);
    ok('item create --generate', cr.status === 0 && cr.stdout.trim().length === 20);
    const li = cli(['item', 'list', '--json']);
    ok('item list vê os dois cofres', JSON.parse(li.stdout || '[]').length === 2);
    const r = cli(['run', '--', 'sh', '-c', 'printf %s "$SENHA_TESTE"'], '', { SENHA_TESTE: 'hub://SERVIDORES/awlsrv sudo/password' });
    ok('run injeta a senha no ambiente', r.stdout === 'segredo-123', r.stderr.trim());
    // (palavra-passe errada: coberta em scripts/teste-cofre-cripto.ts; aqui um código 2FA errado somaria na lista negra)

    // a tela enxerga o que o CLI criou (mesma cripto)
    const depois = (await http('GET', '/cofre', undefined, B)).dados;
    const nomes = depois.cofres.map((x: any) => c.decifrarJson<{ nome: string }>(conta, x.dados, c.adCofre(est.dono, x.id)).nome).sort();
    ok('cofre criado pelo CLI abre na tela', JSON.stringify(nomes) === '["Bancos","SERVIDORES"]', nomes.join(','));
    const aps = (await http('GET', '/cofre/aparelhos', undefined, B)).dados;
    ok('aparelho aparece na lista', aps.some((a: any) => a.nome === 'teste-ci' && !a.revogado));

    ok('hub-pass logout', cli(['logout']).status === 0);
    const aps2 = (await http('GET', '/cofre/aparelhos', undefined, B)).dados;
    ok('logout revoga no servidor', aps2.every((a: any) => a.revogado));
    ok('credencial revogada é recusada', (await http('GET', '/cofre', undefined, { 'x-cofre-aparelho': `${aps2[0].id}.xxxxxxxxxxxxxxxxxxxxxxxx` })).status === 401);
    sessao = '';
  } finally {
    if (usuarioId) {
      execFileSync('docker', ['exec', 'server_db_postgres', 'psql', '-U', 'admin_root', '-d', 'login_hub', '-qc', `delete from cofre_contas where dono = 'u:${Number(usuarioId)}'`]);
      const d = await http('DELETE', `/admin/users/${usuarioId}`, undefined, M);
      console.log(`limpeza: cofre e conta de teste apagados (${d.status})`);
    }
    await http('PUT', `/admin/apps/${painel.id}`, { nome: painel.nome, email: painel.email, documento: painel.documento, cofre_liberado: liberadoAntes }, M);
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`falhas: ${falhas}`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
