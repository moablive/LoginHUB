// Teste ponta a ponta do cofre de usuário + CLI hub-pass (db/014). Mexe só no que cria e apaga tudo no fim.
// Rodar (no servidor, com a API em localhost:3005):
//   LOGINHUB_MASTER_KEY=… npx tsx scripts/teste-cofre-cli.ts   (depois de cli/hub-pass/build.sh)
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as c from '../apps/ui/src/features/cofre/cripto';
import * as par from '../apps/ui/src/features/cofre/pareamento';

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
  const dir2 = mkdtempSync(join(tmpdir(), 'hub-pass-'));
  let usuarioId = '';
  let donoEsperado = '';
  let app2Id = '';
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
    donoEsperado = `p:${createHash('sha256').update(email.trim().toLowerCase()).digest('base64url')}`;
    ok('app liberado: o dono é a pessoa (p:<sha256 do e-mail>)', est.dono === donoEsperado && est.conta === null, est.dono);

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

    // Aprovação pelo navegador (db/017): o CLI mostra um código e espera; este teste faz o papel da tela.
    const env2 = { ...process.env, HUB_PASS_CONFIG: dir2 };
    const cli2 = (args: string[]) => spawnSync('node', [CLI, ...args], { env: env2, encoding: 'utf8' });
    const espera = spawn('node', [CLI, 'login', '--api', API, '--nome', 'teste-aprovacao'], { env: env2 });
    let saida = '';
    espera.stderr.on('data', (d) => (saida += String(d)));
    const fimDoLogin = new Promise<number | null>((r) => espera.on('exit', r));
    for (let i = 0; i < 50 && !/Código:\s+[A-Z2-7-]{14}/.test(saida); i++) await new Promise((r) => setTimeout(r, 200));
    const codigo = par.limparCodigo(/Código:\s+([A-Z2-7-]{14})/.exec(saida)?.[1] ?? '');
    ok('hub-pass login mostra o código do pedido', codigo.length === 12, saida.trim().split('\n')[0]);
    ok('código desconhecido: 404', (await http('GET', '/cofre/aparelhos/pedidos/AAAAAAAAAAAA', undefined, B)).status === 404);
    ok('pedido com chave pública inválida: 400', (await http('POST', '/cofre/aparelhos/pedidos', { id: c.novoId(), nome: 'x', chave_publica: 'curta', token_hash: 'a'.repeat(64) })).status === 400);
    const pedido = (await http('GET', `/cofre/aparelhos/pedidos/${codigo}`, undefined, B)).dados;
    ok('a tela acha o pedido pelo código e o código confere com a chave', pedido.nome === 'teste-aprovacao' && par.codigoDoPedido(pedido.id, pedido.chave_publica) === codigo);
    const ad = par.adSelo(est.dono, pedido.id);
    const seloCofres = await par.selar(pedido.chave_publica, { tipo: 'cofres', cofres: [{ id: cofreId, nome: 'SERVIDORES', chave: c.b64(chaveCofre) }] }, ad);
    const prova = par.provaDoAparelho(conta, est.dono, pedido.id, pedido.chave_publica);
    ok('aprovar sem a prova é recusado', (await http('POST', `/cofre/aparelhos/pedidos/${pedido.id}/aprovar`, { selo: seloCofres, cofres: [cofreId] }, B)).status === 400);
    ok('selo sem cofre nenhum é recusado', (await http('POST', `/cofre/aparelhos/pedidos/${pedido.id}/aprovar`, { selo: seloCofres, cofres: [] }, B)).status === 400);
    ok('selo com cofre de outro dono é recusado', (await http('POST', `/cofre/aparelhos/pedidos/${pedido.id}/aprovar`, { selo: seloCofres, cofres: [c.novoId()] }, B)).status === 404);
    ok('aprovar só o cofre SERVIDORES', (await http('POST', `/cofre/aparelhos/pedidos/${pedido.id}/aprovar`, { selo: seloCofres, cofres: [cofreId], prova }, B)).status === 201);
    ok('hub-pass login termina aprovado', (await fimDoLogin) === 0, saida.trim().split('\n').pop());
    ok('pedido aprovado não serve de novo', (await http('POST', `/cofre/aparelhos/pedidos/${pedido.id}/aprovar`, { selo: seloCofres, cofres: [cofreId], prova }, B)).status === 404);
    const s2 = JSON.parse(readFileSync(join(dir2, 'sessao.json'), 'utf8')) as { aparelho_id: string; token: string; chave?: string; privada?: string };
    ok('sessão nova guarda a chave privada (e não a simétrica), 600', !!s2.privada && !s2.chave && (statSync(join(dir2, 'sessao.json')).mode & 0o777) === 0o600);
    const A2 = { 'x-cofre-aparelho': `${s2.aparelho_id}.${s2.token}` };
    const v2 = cli2(['item', 'view', '--vault', 'SERVIDORES', '--item', 'awlsrv sudo', '--field', 'password']);
    ok('máquina com alcance lê o cofre liberado', v2.stdout === 'segredo-123', v2.stderr.trim());
    ok('máquina com alcance não vê o outro cofre', JSON.parse(cli2(['item', 'list', '--json']).stdout || '[]').length === 1 && cli2(['item', 'list', '--vault', 'Bancos']).status !== 0);
    ok('máquina com alcance não cria cofre', cli2(['vault', 'create', 'Outro']).status !== 0);
    const visto = (await http('GET', '/cofre', undefined, A2)).dados;
    ok('o hub só entrega o cofre liberado, sem os embrulhos da conta', visto.cofres.length === 1 && visto.itens.length === 1 && visto.conta.chave_por_senha === '' && visto.digitais.length === 0);
    const bancos = depois.cofres.find((x: any) => x.id !== cofreId).id;
    const itemFora = c.novoId();
    ok('o hub recusa item num cofre fora do alcance', (await http('PUT', `/cofre/itens/${itemFora}`, { cofre_id: bancos, dados: c.cifrarJson(chaveCofre, { titulo: 'x' }, c.adItem(bancos, itemFora)) }, A2)).status === 404);
    ok('o hub recusa cofre novo vindo da máquina com alcance', (await http('PUT', `/cofre/cofres/${c.novoId()}`, { dados: c.cifrarJson(chaveCofre, { nome: 'x' }, 'x') }, A2)).status === 403);
    ok('máquina não aprova outra', (await http('GET', `/cofre/aparelhos/pedidos/${codigo}`, undefined, A2)).status === 403);
    const naLista = (await http('GET', '/cofre/aparelhos', undefined, B)).dados.find((a: any) => a.id === s2.aparelho_id);
    ok('lista mostra o alcance e a chave pública', JSON.stringify(naLista?.cofres) === JSON.stringify([cofreId]) && naLista?.chave_publica === pedido.chave_publica && naLista?.prova === prova);
    ok('máquina não troca a palavra-passe do cofre', (await http('PUT', '/cofre/conta', { kdf, chave_por_senha: c.cifrar(chaveCofre, conta, 'x') }, A2)).status === 403);
    // a tela muda o alcance para a conta inteira
    const seloConta = await par.selar(pedido.chave_publica, { tipo: 'conta', chave: c.b64(conta) }, ad);
    ok('mudar o alcance para a conta inteira', (await http('PUT', `/cofre/aparelhos/${s2.aparelho_id}/acesso`, { selo: seloConta, cofres: null }, B)).status === 200);
    ok('com a conta inteira a máquina vê os dois cofres e cria cofre', JSON.parse(cli2(['item', 'list', '--json']).stdout || '[]').length === 2 && cli2(['vault', 'create', 'Terceiro']).status === 0);
    ok('máquina não muda o próprio alcance', (await http('PUT', `/cofre/aparelhos/${s2.aparelho_id}/acesso`, { selo: seloConta, cofres: null }, A2)).status === 403);
    ok('hub-pass logout da máquina aprovada pelo navegador', cli2(['logout']).status === 0 && (await http('GET', '/cofre', undefined, A2)).status === 401);

    // Cofre por PESSOA (21/11/2026): a mesma pessoa, com conta em OUTRO app liberado, abre o MESMO cofre.
    const app2 = (await http('POST', '/admin/apps', { nome: `Teste Cofre ${Date.now()}`, email: `app-${Date.now()}@teste.local`, documento: '00000000000' }, M)).dados;
    app2Id = String(app2.appId ?? app2.id ?? '');
    ok('app de teste criado', !!app2Id, JSON.stringify(app2).slice(0, 120));
    await http('PUT', `/admin/apps/${app2Id}`, { nome: app2.nome, email: app2.email, documento: '00000000000', cofre_liberado: true }, M);
    await http('POST', '/admin/users', { app_id: app2Id, nome: 'Teste Cofre 2', email, password: senha, role: 'admin' }, M);
    const setup2 = (await http('POST', '/auth/login', { email, password: senha, app_id: app2Id })).dados.setupToken;
    const segredo2 = (await http('POST', '/auth/2fa/setup', {}, { Authorization: `Bearer ${setup2}` })).dados.secret;
    const sessao2 = (await http('POST', '/auth/2fa/verify-setup', { codigo: totpDe(segredo2) }, { Authorization: `Bearer ${setup2}` })).dados.token;
    const est2 = (await http('GET', '/cofre', undefined, { Authorization: `Bearer ${sessao2}` })).dados;
    ok('outro app, mesma pessoa: o mesmo cofre', est2.dono === donoEsperado && est2.conta !== null && est2.cofres?.length === 3, `${est2.dono} cofres=${est2.cofres?.length}`);
    sessao = '';
  } finally {
    if (usuarioId) {
      if (donoEsperado) execFileSync('docker', ['exec', 'server_db_postgres', 'psql', '-U', 'admin_root', '-d', 'login_hub', '-qc', `delete from cofre_contas where dono = '${donoEsperado.replace(/'/g, '')}'`]);
      const d = await http('DELETE', `/admin/users/${usuarioId}`, undefined, M);
      console.log(`limpeza: cofre e conta de teste apagados (${d.status})`);
    }
    if (app2Id) console.log(`limpeza: app de teste apagado (${(await http('DELETE', `/admin/apps/${app2Id}`, undefined, M)).status})`);
    await http('PUT', `/admin/apps/${painel.id}`, { nome: painel.nome, email: painel.email, documento: painel.documento, cofre_liberado: liberadoAntes }, M);
    rmSync(dir, { recursive: true, force: true });
    rmSync(dir2, { recursive: true, force: true });
  }
  console.log(`falhas: ${falhas}`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
