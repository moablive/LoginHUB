/**
 * O aparelho deste navegador para o login de conta de CPF no "Meu cofre"
 * (24/11/2026, db/019). Conta de CPF só entra dizendo de que aparelho vem; o
 * hub prende a vaga `cofre` ao primeiro que concluir o login por esta tela.
 *
 *   id    código aleatório criado no primeiro login e guardado neste navegador
 *         (`hub_aparelho_id`). Limpar os dados do site ou trocar de navegador
 *         conta como outro aparelho: a vaga do cofre passa para ele depois de
 *         12 h parada, ou na hora pelo "Liberar" do painel.
 *   nome  o que o navegador conta de si, só para pessoas lerem.
 */
const CHAVE = 'hub_aparelho_id';

function idDoAparelho(): string {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo && /^[A-Za-z0-9_-]{16,64}$/.test(salvo)) return salvo;
    const id = crypto.randomUUID();
    localStorage.setItem(CHAVE, id);
    return id;
  } catch {
    // Sem armazenamento (aba anônima bloqueada): id só desta aba.
    return crypto.randomUUID();
  }
}

function nomeDoAparelho(): string {
  const ua = navigator.userAgent;
  const toque = navigator.maxTouchPoints > 1;
  const sistema = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (/Macintosh/.test(ua) && toque) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Aparelho';
  const nav = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser\//.test(ua) ? 'Samsung Internet' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'navegador';
  return `${sistema} · ${nav} · cofre do LoginHUB`;
}

/** `{ id, nome }` para o login. Nunca lança. */
export const aparelhoAtual = (): { id: string; nome: string } => ({ id: idDoAparelho(), nome: nomeDoAparelho() });
