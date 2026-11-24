// Teste ponta a ponta da digital do master (db/020), contra o painel NO AR, com um autenticador VIRTUAL do Chromium
// (CDP WebAuthn): entra com a Master Key, cadastra uma digital de teste, sai, entra pela digital e apaga a digital de
// teste. O autenticador virtual só existe dentro deste navegador: a credencial de teste não serve a mais ninguém e é
// revogada no fim (inclusive se o teste falhar no meio).
//
//   LOGINHUB_MASTER_KEY=… npx tsx scripts/teste-master-digital.ts
//
// O playwright não é dependência do repositório: vem de PLAYWRIGHT (padrão: o do usuário do servidor).
const UI = (process.env.LOGINHUB_UI || 'https://loginhub.astralwavelabel.com').replace(/\/+$/, '');
const API = process.env.LOGINHUB_API || 'http://localhost:3005/api';
const KEY = process.env.LOGINHUB_MASTER_KEY || '';
const NOME = `teste-automatico ${Date.now()} (apagar)`;

let falhas = 0;
const ok = (nome: string, cond: boolean, extra = ''): void => {
  console.log(`${cond ? 'OK   ' : 'FALHA'} ${nome}${extra ? ` (${extra})` : ''}`);
  if (!cond) falhas++;
};

async function http(metodo: string, caminho: string, corpo?: unknown, cab: Record<string, string> = {}): Promise<{ status: number; dados: unknown }> {
  const r = await fetch(API + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...cab },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  return { status: r.status, dados: await r.json().catch(() => ({})) };
}
const M = { 'x-api-key': KEY };
type Digital = { id: number; nome: string };
const deTeste = async (): Promise<Digital[]> => ((await http('GET', '/admin/master-passkeys', undefined, M)).dados as Digital[]).filter((d) => d.nome.startsWith('teste-automatico'));

(async () => {
  if (!KEY) throw new Error('LOGINHUB_MASTER_KEY ausente');
  const { chromium } = (await import(process.env.PLAYWRIGHT || '/home/awlsrv/node_modules/playwright/index.mjs')) as typeof import('playwright');
  const navegador = await chromium.launch();
  try {
    // sem credencial nenhuma, as rotas não abrem
    ok('cadastro sem sessão é recusado', [401, 403].includes((await http('POST', '/admin/master-passkeys/registro/opcoes', {})).status));
    ok('lista sem sessão é recusada', [401, 403].includes((await http('GET', '/admin/master-passkeys')).status));
    ok('assinatura inventada não vira sessão', (await http('POST', '/auth/master-passkey/login/verificar', { challengeToken: 'x', resposta: { id: 'x' } })).status === 401);

    const contexto = await navegador.newContext({ locale: 'pt-BR' });
    const pagina = await contexto.newPage();
    const cdp = await contexto.newCDPSession(pagina);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    });

    // 1. entra com a Master Key e cadastra a digital de teste
    await pagina.goto(`${UI}/login?modo=master`, { waitUntil: 'networkidle' });
    await pagina.locator('input[type="password"]').fill(KEY);
    await pagina.getByRole('button', { name: 'Acessar painel' }).click();
    await pagina.waitForURL(/\/(dashboard|apps)/, { timeout: 20000 });
    await pagina.getByRole('button', { name: 'Digital do master' }).click();
    await pagina.getByLabel('Nome deste aparelho').fill(NOME);
    await pagina.getByRole('button', { name: /Ativar a digital do master/ }).click();
    await pagina.getByText('Pronto: neste aparelho').waitFor({ timeout: 20000 });
    ok('digital de teste cadastrada pela tela', (await deTeste()).some((d) => d.nome === NOME));

    // 2. sai e entra só pela digital
    await pagina.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await pagina.goto(`${UI}/login?modo=master`, { waitUntil: 'networkidle' });
    const botao = pagina.getByRole('button', { name: 'Entrar com a digital' });
    await botao.waitFor({ timeout: 15000 });
    ok('a tela de login mostra o botão da digital', await botao.isVisible());
    await botao.click();
    await pagina.waitForURL(/\/(dashboard|apps)/, { timeout: 20000 });
    const token = await pagina.evaluate(() => localStorage.getItem('awl_token') ?? '');
    const comSessao = await http('GET', '/admin/master-passkeys', undefined, { Authorization: `Bearer ${token}` });
    ok('a sessão da digital é sessão master (lista as digitais)', comSessao.status === 200 && Array.isArray(comSessao.dados));
    // O painel só mostra os botões do master depois de perguntar ao hub quem é a sessão: espera aparecer.
    const noPainel = await pagina.getByRole('button', { name: 'Digital do master' }).waitFor({ timeout: 15000 }).then(() => true, () => false);
    ok('o painel abre com a sessão da digital', noPainel);

    // 3. digital revogada não entra mais
    for (const d of await deTeste()) await http('DELETE', `/admin/master-passkeys/${d.id}`, undefined, M);
    await pagina.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await pagina.goto(`${UI}/login?modo=master`, { waitUntil: 'networkidle' });
    const outras = ((await http('GET', '/admin/master-passkeys', undefined, M)).dados as Digital[]).length;
    if (outras === 0) ok('sem digital nenhuma, a tela volta a mostrar só a Master Key', (await pagina.getByRole('button', { name: 'Entrar com a digital' }).count()) === 0);
    else {
      await pagina.getByRole('button', { name: 'Entrar com a digital' }).click();
      await pagina.waitForTimeout(4000);
      ok('digital revogada não entra', !/\/(dashboard|apps)/.test(new URL(pagina.url()).pathname));
    }
  } finally {
    for (const d of await deTeste()) await http('DELETE', `/admin/master-passkeys/${d.id}`, undefined, M);
    console.log(`limpeza: digitais de teste restantes = ${(await deTeste()).length}`);
    await navegador.close();
  }
  console.log(`falhas: ${falhas}`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
