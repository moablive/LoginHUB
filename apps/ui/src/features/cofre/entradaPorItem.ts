/**
 * Entrada pelo cofre a partir do login guardado (19/11/2026, pedido do dono:
 * com o e-mail, a senha e o 2FA do app já no cofre, "Entrar pelo cofre" deve
 * funcionar sem passar antes pelas configurações do app).
 *
 * Quando o app pede para entrar e o cofre ainda não tem a chave de entrada,
 * mas tem um item de login do endereço do app, o cofre aberto faz ele mesmo o
 * login completo (senha + código do 2FA do item), pede ao hub o passe de
 * cadastro da entrada e sai da sessão. Dali em diante vale a chave de entrada.
 *
 * As chamadas saem por `fetch`, fora do cliente do painel: a sessão da conta do
 * app vive só nesta função e nunca toma o lugar da sessão do dono do cofre.
 */
import { codigoTotp, lerTotp } from './cripto';
import type { ItemAberto } from './useCofre';

const API = String(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export class ErroEntradaPorItem extends Error {
  constructor(
    public codigo: string,
    message: string,
  ) {
    super(message);
    this.name = 'ErroEntradaPorItem';
  }
}

const hostDe = (endereco: string): string | null => {
  try {
    const u = new URL(/^https?:\/\//i.test(endereco) ? endereco : `https://${endereco}`);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
};

/** Itens de login (usuário + senha, sem chave de entrada) cujo endereço é o do app. */
export function itensDeLoginDoApp(itens: ItemAberto[], origemDoApp: string): ItemAberto[] {
  const host = hostDe(origemDoApp);
  if (!host) return [];
  return itens.filter((i) => !i.entrada && !!i.usuario.trim() && !!i.senha && hostDe(i.url) === host);
}

async function chamar(caminho: string, corpo: unknown, token?: string): Promise<Record<string, unknown>> {
  let resposta: Response;
  try {
    resposta = await fetch(`${API}${caminho}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(corpo),
    });
  } catch {
    throw new ErroEntradaPorItem('REDE', 'Sem conexão com o servidor de login.');
  }
  const dados = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resposta.ok) throw new ErroEntradaPorItem(String(dados.error || 'ERRO'), String(dados.message || 'O login do item não foi aceito.'));
  return dados;
}

const texto = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * Faz o login completo da conta do item no app e devolve o passe de cadastro
 * da entrada pelo cofre (5 minutos). A sessão usada é encerrada antes de voltar.
 */
export async function passeDeCadastroPeloItem(item: ItemAberto, appId: number): Promise<string> {
  const login = await chamar('/auth/login', { email: item.usuario.trim(), password: item.senha, app_id: String(appId) });

  let token = login.token;
  if (login.requires2FA === true && texto(login.challengeToken)) {
    const totp = lerTotp(item.totp);
    if (!totp) throw new ErroEntradaPorItem('SEM_2FA', 'A conta pede o código do autenticador e este item não tem o 2FA guardado.');
    token = (await chamar('/auth/2fa/verify', { challengeToken: login.challengeToken, codigo: codigoTotp(totp) })).token;
  } else if (login.require2FASetup === true) {
    throw new ErroEntradaPorItem('SEM_2FA', 'A conta ainda não ativou o autenticador. Conclua o primeiro acesso no aplicativo.');
  }
  if (!texto(token)) throw new ErroEntradaPorItem('ERRO', 'O servidor de login não devolveu a sessão.');

  try {
    const { passe } = await chamar('/auth/cofre-entrada/registro/opcoes', {}, token);
    if (!texto(passe)) throw new ErroEntradaPorItem('ERRO', 'O servidor de login não devolveu o pedido de cadastro.');
    return passe;
  } finally {
    // O passe não depende da sessão: ela sai mesmo se o pedido falhou.
    await chamar('/auth/logout', {}, token).catch(() => undefined);
  }
}
