/**
 * hub-pass — CLI do cofre de senhas do LoginHUB (19/11/2026, db/013 e db/014).
 *
 * No molde do `pass-cli` do Proton Pass: `login` aprova ESTA máquina uma vez e
 * daí em diante os comandos funcionam sem perguntar nada — é o que os scripts
 * dos servidores precisam. Revogar o aparelho no navegador desliga a máquina na hora.
 *
 * Duas formas de aprovar:
 *   `hub-pass login` (23/11/2026, db/017): a máquina sorteia um par X25519 e um
 *       token, mostra um CÓDIGO e espera; a pessoa digita o código no cofre
 *       aberto no navegador (digital ou palavra-passe) e escolhe os cofres.
 *       Nada é digitado aqui. A sessão guarda a chave PRIVADA; o servidor guarda
 *       o selo cifrado para a pública (a conta inteira ou só os cofres escolhidos).
 *   `hub-pass login --email …` (a primeira, db/014): e-mail + senha + código do
 *       2FA + palavra-passe do cofre digitados na máquina. A sessão guarda a chave
 *       simétrica do aparelho; o servidor, a chave da conta embrulhada por ela.
 * Nos dois casos a sessão mora em ~/.config/hub-pass/sessao.json (600).
 *
 * A criptografia é a MESMA da tela (apps/ui/src/features/cofre/cripto.ts):
 * o servidor nunca vê palavra-passe, chave nem senha guardada.
 */
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, hostname, userInfo } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import {
  adAparelho,
  adCofre,
  adContaSenha,
  adItem,
  b64,
  chaveMestraDe,
  cifrar,
  cifrarJson,
  codigoTotp,
  decifrar,
  decifrarJson,
  deB64,
  gerarSenha,
  lerTotp,
  novaChave,
  novoId,
  segundosRestantes,
} from '../../../apps/ui/src/features/cofre/cripto';
import { abrirSelo, adSelo, codigoDoPedido, formatarCodigo, novoParDoAparelho } from '../../../apps/ui/src/features/cofre/pareamento';
import type { CofreEstado } from '@loginhub/schema';

const VERSAO = '1.1.0';
const API_PADRAO = 'https://loginhub.astralwavelabel.com/api';
const MASTER_LOGIN_EMAIL = 'master@infra.local';
const DIR = process.env.HUB_PASS_CONFIG || join(homedir(), '.config', 'hub-pass');
const ARQ = join(DIR, 'sessao.json');

interface Sessao {
  api: string;
  aparelho_id: string;
  token: string;
  /** Aprovação com `--email`: chave simétrica do aparelho (base64). Sem o embrulho que está no servidor, não abre nada. */
  chave?: string;
  /** Aprovação pelo navegador: par X25519 da máquina (base64). A privada nunca sai daqui. */
  publica?: string;
  privada?: string;
  dono: string;
  conta: string;
  nome: string;
}

interface ItemCofre {
  titulo: string;
  usuario: string;
  senha: string;
  url: string;
  totp: string;
  notas: string;
}

interface CofreAberto {
  id: string;
  nome: string;
  chave: Uint8Array;
}

interface ItemAberto extends ItemCofre {
  id: string;
  cofre_id: string;
}

// ------------------------------------------------------------ utilidades

class ErroCli extends Error {
  constructor(mensagem: string, public codigo = 1) {
    super(mensagem);
  }
}

function args(lista: string[]): { pos: string[]; op: Record<string, string | true> } {
  const pos: string[] = [];
  const op: Record<string, string | true> = {};
  for (let i = 0; i < lista.length; i++) {
    const a = lista[i]!;
    if (a === '--') {
      pos.push(...lista.slice(i));
      break;
    }
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split(/=(.*)/s, 2) as [string, string | undefined];
      if (v !== undefined) op[k] = v;
      else if (lista[i + 1] !== undefined && !lista[i + 1]!.startsWith('--')) op[k] = lista[++i]!;
      else op[k] = true;
    } else pos.push(a);
  }
  return { pos, op };
}

/** Lê `--vault` ou `--vault-name` (nome do pass-cli), etc. */
const opcao = (op: Record<string, string | true>, ...nomes: string[]): string | undefined => {
  for (const n of nomes) {
    const v = op[n];
    if (typeof v === 'string') return v;
  }
  return undefined;
};

// Sem terminal (respostas por pipe, como no teste): um leitor só para a
// entrada inteira — vários readline seguidos perderiam as linhas já lidas.
let leitorPipe: ReturnType<typeof createInterface> | null = null;
const filaPipe: string[] = [];
const esperasPipe: Array<(s: string) => void> = [];
function linhaDoPipe(): Promise<string> {
  if (!leitorPipe) {
    leitorPipe = createInterface({ input: process.stdin, terminal: false });
    leitorPipe.on('line', (l) => {
      const w = esperasPipe.shift();
      if (w) w(l);
      else filaPipe.push(l);
    });
    leitorPipe.on('close', () => {
      while (esperasPipe.length) esperasPipe.shift()!('');
    });
  }
  const l = filaPipe.shift();
  return l !== undefined ? Promise.resolve(l) : new Promise((r) => esperasPipe.push(r));
}

function perguntar(rotulo: string, oculto = false): Promise<string> {
  if (!process.stdin.isTTY) {
    process.stderr.write(rotulo + '\n');
    return linhaDoPipe().then((l) => l.trim());
  }
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: process.stdin.isTTY === true });
    if (oculto && process.stdin.isTTY) {
      const r = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
      r._writeToOutput = (s: string) => {
        if (s.startsWith(rotulo)) r.output.write(s);
        else if (s.includes('\n') || s.includes('\r')) r.output.write('\n');
      };
    }
    rl.question(rotulo, (resposta) => {
      rl.close();
      resolve(resposta.trim());
    });
  });
}

function lerSessao(): Sessao {
  if (!existsSync(ARQ)) throw new ErroCli('Sem sessão. Rode: hub-pass login');
  return JSON.parse(readFileSync(ARQ, 'utf8')) as Sessao;
}

function gravarSessao(s: Sessao): void {
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  chmodSync(DIR, 0o700);
  writeFileSync(ARQ, JSON.stringify(s, null, 2), { mode: 0o600 });
  chmodSync(ARQ, 0o600);
}

async function chamar<T>(api: string, metodo: string, caminho: string, opcoes: { corpo?: unknown; bearer?: string; aparelho?: string } = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${api.replace(/\/+$/, '')}${caminho}`, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `hub-pass/${VERSAO}`,
        ...(opcoes.bearer ? { Authorization: `Bearer ${opcoes.bearer}` } : {}),
        ...(opcoes.aparelho ? { 'x-cofre-aparelho': opcoes.aparelho } : {}),
      },
      ...(opcoes.corpo === undefined ? {} : { body: JSON.stringify(opcoes.corpo) }),
    });
  } catch {
    throw new ErroCli(`Sem conexão com ${api}.`);
  }
  const dados = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    const e = new ErroCli(String(dados.message || dados.error || `HTTP ${r.status}`)) as ErroCli & { status?: number; dados?: Record<string, unknown> };
    e.status = r.status;
    e.dados = dados;
    throw e;
  }
  return dados as T;
}

// ------------------------------------------------------------ cofre aberto pelo aparelho

/** O estado que o servidor devolveu, aberto com a chave desta máquina. `conta` nula = alcance só de alguns cofres. */
async function abrirEstado(s: Sessao, estado: CofreEstado): Promise<{ conta: Uint8Array | null; cofres: CofreAberto[]; itens: ItemAberto[] }> {
  if (!estado.aparelho) throw new ErroCli('O servidor não devolveu a chave deste aparelho. Rode: hub-pass login');
  let conta: Uint8Array | null = null;
  const cofres: CofreAberto[] = [];
  if (estado.aparelho.selo && s.privada && s.publica) {
    let conteudo: Awaited<ReturnType<typeof abrirSelo>>;
    try {
      conteudo = await abrirSelo({ publica: s.publica, privada: s.privada }, estado.aparelho.selo, adSelo(estado.dono, s.aparelho_id));
    } catch {
      throw new ErroCli('A chave desta máquina não abre o cofre. Rode: hub-pass login');
    }
    if (conteudo.tipo === 'conta') conta = deB64(conteudo.chave);
    // Alcance por cofre: o nome e a chave vêm no selo; o registro do cofre a máquina não consegue ler.
    else for (const c of conteudo.cofres) if (estado.cofres.some((x) => x.id === c.id)) cofres.push({ id: c.id, nome: c.nome, chave: deB64(c.chave) });
  } else if (estado.aparelho.chave_por_aparelho && s.chave) {
    try {
      conta = decifrar(deB64(s.chave), estado.aparelho.chave_por_aparelho, adAparelho(estado.dono, s.aparelho_id));
    } catch {
      throw new ErroCli('A chave deste aparelho não abre o cofre. Rode: hub-pass login');
    }
  } else throw new ErroCli('A sessão desta máquina não combina com a aprovação dela. Rode: hub-pass login');
  if (conta) {
    for (const c of estado.cofres) {
      try {
        const d = decifrarJson<{ nome: string; chave: string }>(conta, c.dados, adCofre(estado.dono, c.id));
        cofres.push({ id: c.id, nome: d.nome, chave: deB64(d.chave) });
      } catch {
        process.stderr.write(`aviso: cofre ${c.id} não abriu (alterado fora do cofre?)\n`);
      }
    }
  }
  const itens: ItemAberto[] = [];
  for (const i of estado.itens) {
    const cofre = cofres.find((c) => c.id === i.cofre_id);
    if (!cofre) continue;
    try {
      itens.push({ ...decifrarJson<ItemCofre>(cofre.chave, i.dados, adItem(i.cofre_id, i.id)), id: i.id, cofre_id: i.cofre_id });
    } catch {
      process.stderr.write(`aviso: item ${i.id} não abriu (alterado fora do cofre?)\n`);
    }
  }
  cofres.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  itens.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
  return { conta, cofres, itens };
}

async function abrir(): Promise<{ s: Sessao; conta: Uint8Array | null; cofres: CofreAberto[]; itens: ItemAberto[] }> {
  const s = lerSessao();
  const cred = `${s.aparelho_id}.${s.token}`;
  let estado: CofreEstado;
  try {
    estado = await chamar<CofreEstado>(s.api, 'GET', '/cofre', { aparelho: cred });
  } catch (e) {
    if ((e as { status?: number }).status === 401) throw new ErroCli('Esta máquina não está mais aprovada (revogada?). Rode: hub-pass login');
    throw e;
  }
  return { s, ...(await abrirEstado(s, estado)) };
}

const igual = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'accent' }) === 0;

function acharCofre(cofres: CofreAberto[], nome: string | undefined): CofreAberto {
  if (!nome) throw new ErroCli('Informe o cofre: --vault <nome>');
  const c = cofres.find((x) => igual(x.nome, nome) || x.id === nome);
  if (!c) throw new ErroCli(`Cofre "${nome}" não existe. Cofres: ${cofres.map((x) => x.nome).join(', ') || '(nenhum)'}`);
  return c;
}

function acharItem(itens: ItemAberto[], cofre: CofreAberto, titulo: string | undefined): ItemAberto {
  if (!titulo) throw new ErroCli('Informe o item: --item <título>');
  const doCofre = itens.filter((i) => i.cofre_id === cofre.id);
  const achados = doCofre.filter((i) => i.id === titulo || igual(i.titulo, titulo));
  if (achados.length === 0) throw new ErroCli(`Item "${titulo}" não existe no cofre ${cofre.nome}.`);
  if (achados.length > 1) throw new ErroCli(`Há ${achados.length} itens "${titulo}" no cofre ${cofre.nome}; use --item <id>: ${achados.map((i) => i.id).join(', ')}`);
  return achados[0]!;
}

// Nomes aceitos em --field (os do pass-cli e os em português) → campo do item.
const CAMPOS = new Map<string, keyof ItemCofre | 'totp-code'>([
  ...(['title', 'titulo'] as const).map((n) => [n, 'titulo'] as const),
  ...(['username', 'usuario', 'user', 'email'] as const).map((n) => [n, 'usuario'] as const),
  ...(['pass' + 'word', 'senha'] as const).map((n) => [n, 'senha'] as const),
  ['url', 'url'] as const,
  ...(['notes', 'note', 'notas'] as const).map((n) => [n, 'notas'] as const),
  ...(['totp', 'codigo', 'code'] as const).map((n) => [n, 'totp-code'] as const),
  ['totp-secret', 'totp'] as const,
]);

function campo(item: ItemAberto, nome: string): string {
  const c = CAMPOS.get(nome.toLowerCase());
  if (!c) throw new ErroCli(`Campo "${nome}" desconhecido. Use: password, username, url, notes, totp, title, totp-secret.`);
  if (c === 'totp-code') {
    const t = lerTotp(item.totp);
    if (!t) throw new ErroCli(`O item "${item.titulo}" não tem 2FA.`);
    return codigoTotp(t);
  }
  return item[c];
}

async function salvarItem(s: Sessao, cofre: CofreAberto, id: string, dados: ItemCofre): Promise<void> {
  await chamar(s.api, 'PUT', `/cofre/itens/${id}`, {
    aparelho: `${s.aparelho_id}.${s.token}`,
    corpo: { cofre_id: cofre.id, dados: cifrarJson(cofre.chave, dados, adItem(cofre.id, id)) },
  });
}

function dadosDasOpcoes(op: Record<string, string | true>, base: ItemCofre): ItemCofre {
  const d = { ...base };
  const t = opcao(op, 'title', 'titulo', 'item-title');
  if (t !== undefined) d.titulo = t;
  const u = opcao(op, 'username', 'usuario', 'email');
  if (u !== undefined) d.usuario = u;
  const p = opcao(op, 'password', 'senha');
  if (p !== undefined) d.senha = p;
  if (op.generate !== undefined) d.senha = gerarSenha(typeof op.generate === 'string' ? Math.max(8, Math.min(128, Number(op.generate) || 24)) : 24);
  const url = opcao(op, 'url');
  if (url !== undefined) d.url = url;
  const totp = opcao(op, 'totp', 'totp-secret');
  if (totp !== undefined) {
    if (totp && !lerTotp(totp)) throw new ErroCli('Chave de 2FA inválida (base32 ou otpauth://).');
    d.totp = totp;
  }
  const n = opcao(op, 'note', 'notes', 'notas');
  if (n !== undefined) d.notas = n;
  return d;
}

// ------------------------------------------------------------ comandos

const PEDIDO_MS = 10 * 60 * 1000;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A aprovação antiga desta máquina deixa de valer (best effort). */
async function revogarAnterior(anterior: Sessao | null, idNovo: string): Promise<void> {
  if (!anterior || anterior.aparelho_id === idNovo) return;
  await chamar(anterior.api, 'DELETE', `/cofre/aparelhos/${anterior.aparelho_id}`, { aparelho: `${anterior.aparelho_id}.${anterior.token}` }).catch(() => undefined);
}

/**
 * Aprovação pelo navegador (db/017): deixa o pedido no hub, mostra o código e
 * espera a pessoa aprovar com o cofre aberto. Nada secreto é digitado aqui.
 */
async function loginPorAprovacao(api: string, op: Record<string, string | true>): Promise<void> {
  const anterior = existsSync(ARQ) ? (JSON.parse(readFileSync(ARQ, 'utf8')) as Sessao) : null;
  const id = novoId();
  const nome = opcao(op, 'nome', 'name') || `${hostname()} (${userInfo().username})`;
  const par = await novoParDoAparelho();
  const token = randomBytes(32).toString('base64url');
  const cred = `${id}.${token}`;
  const { codigo } = await chamar<{ codigo: string }>(api, 'POST', '/cofre/aparelhos/pedidos', {
    corpo: { id, nome, chave_publica: par.publica, token_hash: createHash('sha256').update(token).digest('hex') },
  });
  // O código é a mesma conta do hub; se ele devolvesse outro, alguém mexeu no pedido.
  if (codigo !== codigoDoPedido(id, par.publica)) throw new ErroCli('O servidor devolveu um código que não é o desta máquina. Não aprove nada.');
  const ui = api.replace(/\/api\/?$/, '');
  const visivel = formatarCodigo(codigo);
  process.stderr.write(
    `\nPedido de aprovação de "${nome}".\n\n    Código:  ${visivel}\n\n` +
      `Abra o cofre no navegador (pela digital ou pela palavra-passe), toque no ícone do terminal e digite o código:\n` +
      `    ${ui}/cofre?aprovar=${visivel}\n` +
      `    (conta de aplicativo: ${ui}/meu-cofre?aprovar=${visivel})\n\n` +
      `Esperando a aprovação (vale 10 minutos; Ctrl+C desiste)…\n`,
  );
  const fim = Date.now() + PEDIDO_MS;
  for (;;) {
    await dormir(3000);
    let estado: CofreEstado;
    try {
      estado = await chamar<CofreEstado>(api, 'GET', '/cofre', { aparelho: cred });
    } catch (e) {
      // 401 = ainda não aprovado. Qualquer outra coisa (rede, 5xx) também espera, até o prazo.
      if (Date.now() > fim) throw new ErroCli((e as { status?: number }).status === 401 ? 'O pedido venceu sem aprovação. Rode hub-pass login de novo.' : `Sem resposta do servidor: ${(e as Error).message}`);
      continue;
    }
    const s: Sessao = { api, aparelho_id: id, token, publica: par.publica, privada: par.privada, dono: estado.dono, conta: estado.dono, nome };
    const { conta, cofres } = await abrirEstado(s, estado);
    conta?.fill(0);
    gravarSessao(s);
    await revogarAnterior(anterior, id);
    const alcance = estado.aparelho?.cofres ? `${cofres.length} cofre(s): ${cofres.map((c) => c.nome).join(', ')}` : 'todos os cofres (a conta inteira)';
    process.stderr.write(`Máquina aprovada: ${nome}, pelo cofre de ${estado.dono}. Abre ${alcance}. Sessão em ${ARQ} (600).\n`);
    return;
  }
}

async function login(op: Record<string, string | true>): Promise<void> {
  const api = opcao(op, 'api') || process.env.HUB_PASS_API || API_PADRAO;
  // Sem --email: aprovação pelo navegador. Com --email: a forma antiga, tudo digitado aqui.
  const email = opcao(op, 'email');
  if (!email) return loginPorAprovacao(api, op);
  let bearer: string;

  if (email.toLowerCase() === 'master') {
    const chave = await perguntar('Master Key: ', true);
    bearer = (await chamar<{ token: string }>(api, 'POST', '/auth/login', { corpo: { email: MASTER_LOGIN_EMAIL, password: chave } })).token;
  } else {
    const senha = await perguntar('Senha: ', true);
    let appId = opcao(op, 'app');
    let resp: Record<string, unknown>;
    for (;;) {
      try {
        resp = await chamar<Record<string, unknown>>(api, 'POST', '/auth/login', { corpo: { email, password: senha, ...(appId ? { app_id: appId } : {}) } });
        break;
      } catch (e) {
        const d = (e as { dados?: Record<string, unknown> }).dados;
        if (d?.error !== 'AMBIGUOUS_EMAIL') throw e;
        const apps = (d.availableApps as Array<{ id: string; nome: string }>) ?? [];
        apps.forEach((a, i) => process.stderr.write(`  ${i + 1}) ${a.nome}\n`));
        const n = Number(await perguntar('Este e-mail está em mais de um aplicativo. Qual? '));
        appId = apps[n - 1]?.id;
        if (!appId) throw new ErroCli('Escolha inválida.');
      }
    }
    if (resp.require2FASetup) throw new ErroCli('Termine primeiro o convite da conta (senha + Google Authenticator) no navegador.');
    if (resp.requires2FA) {
      const codigo = await perguntar('Código do Google Authenticator: ');
      resp = await chamar<Record<string, unknown>>(api, 'POST', '/auth/2fa/verify', { corpo: { challengeToken: resp.challengeToken, codigo } });
    }
    bearer = String(resp.token);
  }

  const estado = await chamar<CofreEstado>(api, 'GET', '/cofre', { bearer });
  if (!estado.conta) {
    const ui = api.replace(/\/api\/?$/, '');
    throw new ErroCli(`Esta conta ainda não tem cofre. Crie no navegador: ${email.toLowerCase() === 'master' ? `${ui}/cofre` : `${ui}/meu-cofre`}`);
  }
  const palavra = await perguntar('Palavra-passe do cofre: ', true);
  process.stderr.write('Abrindo (alguns segundos)…\n');
  const mestra = await chaveMestraDe(palavra, estado.conta.kdf);
  let conta: Uint8Array;
  try {
    conta = decifrar(mestra, estado.conta.chave_por_senha, adContaSenha(estado.dono));
  } catch {
    throw new ErroCli('Palavra-passe errada.');
  } finally {
    mestra.fill(0);
  }

  const anterior = existsSync(ARQ) ? (JSON.parse(readFileSync(ARQ, 'utf8')) as Sessao) : null;
  const chaveAparelho = novaChave();
  const id = novoId();
  const nome = opcao(op, 'nome', 'name') || `${hostname()} (${userInfo().username})`;
  const { token } = await chamar<{ token: string }>(api, 'POST', '/cofre/aparelhos', {
    bearer,
    corpo: { id, nome, chave_por_aparelho: cifrar(chaveAparelho, conta, adAparelho(estado.dono, id)) },
  });
  conta.fill(0);
  gravarSessao({ api, aparelho_id: id, token, chave: b64(chaveAparelho), dono: estado.dono, conta: email, nome });
  await revogarAnterior(anterior, id);
  process.stderr.write(`Máquina aprovada: ${nome}. Sessão em ${ARQ} (600).\n`);
}

async function logout(): Promise<void> {
  if (!existsSync(ARQ)) return void process.stderr.write('Não há sessão.\n');
  const s = lerSessao();
  await chamar(s.api, 'DELETE', `/cofre/aparelhos/${s.aparelho_id}`, { aparelho: `${s.aparelho_id}.${s.token}` }).catch(() => undefined);
  rmSync(ARQ, { force: true });
  process.stderr.write('Máquina revogada e sessão apagada.\n');
}

async function info(): Promise<void> {
  const { s, conta, cofres, itens } = await abrir();
  console.log(`conta:    ${s.conta} (${s.dono})`);
  console.log(`máquina:  ${s.nome} (${s.aparelho_id})`);
  console.log(`servidor: ${s.api}`);
  console.log(`alcance:  ${conta ? 'todos os cofres (a conta inteira)' : 'só os cofres escolhidos na aprovação'}`);
  console.log(`cofres:   ${cofres.length} · itens: ${itens.length}`);
}

async function vault(sub: string | undefined, pos: string[], op: Record<string, string | true>): Promise<void> {
  const { s, conta, cofres, itens } = await abrir();
  if (sub === 'list' || sub === undefined) {
    if (op.json) return void console.log(JSON.stringify(cofres.map((c) => ({ id: c.id, nome: c.nome, itens: itens.filter((i) => i.cofre_id === c.id).length }))));
    for (const c of cofres) console.log(`${c.nome}\t${itens.filter((i) => i.cofre_id === c.id).length} itens\t${c.id}`);
    return;
  }
  if (sub === 'create') {
    const nome = (pos[0] || opcao(op, 'name', 'nome', 'vault-name') || '').trim();
    if (!nome) throw new ErroCli('Uso: hub-pass vault create <nome>');
    if (!conta) throw new ErroCli('Esta máquina só tem acesso a cofres escolhidos: crie o cofre no navegador e libere-o para ela (Cofre → ícone do terminal → Cofres).');
    if (cofres.some((c) => igual(c.nome, nome))) throw new ErroCli(`Já existe o cofre "${nome}".`);
    const id = novoId();
    await chamar(s.api, 'PUT', `/cofre/cofres/${id}`, {
      aparelho: `${s.aparelho_id}.${s.token}`,
      corpo: { dados: cifrarJson(conta, { nome, chave: b64(novaChave()) }, adCofre(s.dono, id)) },
    });
    return void process.stderr.write(`Cofre "${nome}" criado.\n`);
  }
  throw new ErroCli('Uso: hub-pass vault list | create <nome>');
}

async function item(sub: string | undefined, op: Record<string, string | true>): Promise<void> {
  const { s, cofres, itens } = await abrir();
  const nomeCofre = opcao(op, 'vault', 'vault-name', 'cofre');
  const nomeItem = opcao(op, 'item', 'item-title', 'title', 'titulo');

  if (sub === 'list') {
    const lista = nomeCofre ? itens.filter((i) => i.cofre_id === acharCofre(cofres, nomeCofre).id) : itens;
    const cofreDe = (id: string) => cofres.find((c) => c.id === id)?.nome ?? '';
    if (op.json) return void console.log(JSON.stringify(lista.map((i) => ({ id: i.id, cofre: cofreDe(i.cofre_id), titulo: i.titulo, usuario: i.usuario, url: i.url, tem_2fa: !!lerTotp(i.totp) }))));
    for (const i of lista) console.log(`${cofreDe(i.cofre_id)}\t${i.titulo}\t${i.usuario}${lerTotp(i.totp) ? '\t[2FA]' : ''}`);
    return;
  }

  if (sub === 'create') {
    const cofre = acharCofre(cofres, nomeCofre);
    const dados = dadosDasOpcoes(op, { titulo: '', usuario: '', senha: '', url: '', totp: '', notas: '' });
    if (!dados.titulo.trim()) throw new ErroCli('Informe --title <título>.');
    await salvarItem(s, cofre, novoId(), dados);
    process.stderr.write(`Item "${dados.titulo}" criado em ${cofre.nome}.\n`);
    if (op.generate !== undefined) console.log(dados.senha);
    return;
  }

  const cofre = acharCofre(cofres, nomeCofre);
  const alvo = acharItem(itens, cofre, nomeItem);

  if (sub === 'view') {
    const f = opcao(op, 'field', 'campo');
    if (f) return void process.stdout.write(campo(alvo, f) + (process.stdout.isTTY ? '\n' : ''));
    const t = lerTotp(alvo.totp);
    if (op.json) return void console.log(JSON.stringify({ id: alvo.id, cofre: cofre.nome, titulo: alvo.titulo, usuario: alvo.usuario, senha: alvo.senha, url: alvo.url, notas: alvo.notas, codigo_2fa: t ? codigoTotp(t) : null }));
    console.log(`título:   ${alvo.titulo}`);
    if (alvo.usuario) console.log(`usuário:  ${alvo.usuario}`);
    if (alvo.senha) console.log(`senha:    ${alvo.senha}`);
    if (alvo.url) console.log(`url:      ${alvo.url}`);
    if (t) console.log(`2FA:      ${codigoTotp(t)} (${segundosRestantes(t)}s)`);
    if (alvo.notas) console.log(`notas:    ${alvo.notas}`);
    return;
  }
  if (sub === 'totp') return void console.log(campo(alvo, 'totp'));
  if (sub === 'update') {
    const { id, cofre_id: _c, ...base } = alvo;
    const dados = dadosDasOpcoes(op, base);
    await salvarItem(s, cofre, id, dados);
    process.stderr.write(`Item "${dados.titulo}" atualizado.\n`);
    if (op.generate !== undefined) console.log(dados.senha);
    return;
  }
  if (sub === 'delete') {
    await chamar(s.api, 'DELETE', `/cofre/itens/${alvo.id}`, { aparelho: `${s.aparelho_id}.${s.token}` });
    return void process.stderr.write(`Item "${alvo.titulo}" apagado.\n`);
  }
  throw new ErroCli('Uso: hub-pass item list|view|totp|create|update|delete --vault <cofre> --item <título>');
}

/**
 * `hub-pass run -- comando`: variáveis de ambiente com valor `hub://Cofre/Item/campo`
 * viram o segredo antes de rodar o comando (igual ao `pass-cli run`).
 */
async function run(resto: string[]): Promise<void> {
  const cmd = resto[0] === '--' ? resto.slice(1) : resto;
  if (!cmd.length) throw new ErroCli('Uso: VAR=hub://Cofre/Item/password hub-pass run -- comando [args]');
  const env: NodeJS.ProcessEnv = { ...process.env };
  const refs = Object.entries(env).filter(([, v]) => v?.startsWith('hub://'));
  if (refs.length) {
    const { cofres, itens } = await abrir();
    for (const [k, v] of refs) {
      const m = /^hub:\/\/([^/]+)\/(.+)\/([^/]+)$/.exec(v!);
      if (!m) throw new ErroCli(`${k}: referência inválida (hub://Cofre/Item/campo).`);
      const cofre = acharCofre(cofres, decodeURIComponent(m[1]!));
      env[k] = campo(acharItem(itens, cofre, decodeURIComponent(m[2]!)), m[3]!);
    }
  }
  const filho = spawn(cmd[0]!, cmd.slice(1), { stdio: 'inherit', env });
  filho.on('exit', (code, sinal) => process.exit(sinal ? 1 : (code ?? 0)));
}

const AJUDA = `hub-pass ${VERSAO} — cofre de senhas do LoginHUB (cifrado de ponta a ponta)

  hub-pass login [--api URL] [--nome "nome da máquina"]
                                                 mostra um código; aprove no navegador, com o cofre aberto
  hub-pass login --email E [--api URL] [--nome N]  forma antiga: e-mail (ou "master"), senha, 2FA e palavra-passe aqui
  hub-pass logout                                revoga esta máquina e apaga a sessão
  hub-pass info
  hub-pass vault list | create <nome>
  hub-pass item list [--vault V]
  hub-pass item view   --vault V --item T [--field password|username|url|notes|totp|title] [--json]
  hub-pass item totp   --vault V --item T
  hub-pass item create --vault V --title T [--username U] [--password P | --generate[=24]] [--url U] [--totp CHAVE] [--note N]
  hub-pass item update --vault V --item T [os mesmos campos]
  hub-pass item delete --vault V --item T
  hub-pass password generate [--length 24]
  VAR=hub://Cofre/Item/password hub-pass run -- comando

Aceita também os nomes do pass-cli: --vault-name, --item-title.
Sessão: ${ARQ} (600). Revogue máquinas no navegador (Cofre → ícone do terminal).`;

async function main(): Promise<void> {
  const [cmd, sub, ...resto] = process.argv.slice(2);
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') return void console.log(AJUDA);
  if (cmd === '--version' || cmd === '-V' || cmd === 'version') return void console.log(VERSAO);
  if (cmd === 'run') return run([sub ?? '', ...resto].filter((x, i) => i > 0 || x !== ''));
  const { pos, op } = args(sub && !sub.startsWith('--') ? resto : [sub ?? '', ...resto].filter(Boolean));
  const subcmd = sub && !sub.startsWith('--') ? sub : undefined;
  switch (cmd) {
    case 'login':
      return login(args([sub ?? '', ...resto].filter(Boolean)).op);
    case 'logout':
      return logout();
    case 'info':
      return info();
    case 'vault':
      return vault(subcmd, pos, op);
    case 'item':
      return item(subcmd, op);
    case 'password': {
      const n = Number(opcao(op, 'length', 'tamanho') ?? 24);
      return void console.log(gerarSenha(Math.max(8, Math.min(128, n || 24))));
    }
    default:
      throw new ErroCli(`Comando desconhecido: ${cmd}\n\n${AJUDA}`);
  }
}

main()
  .then(() => leitorPipe?.close())
  .catch((e: unknown) => {
    process.stderr.write(`hub-pass: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(e instanceof ErroCli ? e.codigo : 1);
  });
