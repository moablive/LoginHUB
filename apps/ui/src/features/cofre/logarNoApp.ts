/**
 * Botão "Logar no app" do item do cofre (27/11/2026, pedido do dono): com o cofre
 * aberto, um clique leva ao aplicativo já logado.
 *
 * É o mesmo caminho de "Entrar pelo cofre", só que iniciado de dentro do cofre:
 * pede ao hub um desafio de entrada do app, assina com a chave de entrada do item
 * (ou, se o item só tem e-mail, senha e 2FA, faz o login uma vez e guarda a chave) e
 * volta ao app em `/entrar`. A origem do app vem do hub, nunca do endereço do item.
 */
import { cofreApi } from '@loginhub/api-client';
import { passeDeCadastroPeloItem, ErroEntradaPorItem } from './entradaPorItem';
import type { ItemAberto, useCofre } from './useCofre';

const API = String(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

type Cofre = ReturnType<typeof useCofre>;

const nomeDoAparelho = (): string => {
  const ua = navigator.userAgent;
  const sistema = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Aparelho';
  return `Cofre do LoginHUB · ${sistema}`;
};

/** O item serve para o botão: tem chave de entrada, ou e-mail + senha de login. */
export const podeLogarNoApp = (item: ItemAberto): boolean => !!item.entrada || (!!item.usuario.trim() && !!item.senha);

async function desafioDoApp(appId: number): Promise<string> {
  let resposta: Response;
  try {
    resposta = await fetch(`${API}/auth/cofre-entrada/login/opcoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId }),
    });
  } catch {
    throw new ErroEntradaPorItem('REDE', 'Sem conexão com o servidor de login.');
  }
  const dados = (await resposta.json().catch(() => ({}))) as { passe?: unknown; message?: unknown };
  if (!resposta.ok || typeof dados.passe !== 'string') {
    throw new ErroEntradaPorItem('ERRO', String(dados.message || 'O aplicativo não aceita entrada pelo cofre.'));
  }
  return dados.passe;
}

/** Faz a entrada e navega para o app; só volta (sem navegar) se der erro, que é lançado. */
export async function logarNoApp(cofre: Cofre, item: ItemAberto, appId: number): Promise<void> {
  const passe = await desafioDoApp(appId);
  const pedido = await cofreApi.pedidoDeEntrada(passe);
  if (pedido.acao !== 'entrar' || pedido.app.id !== appId) throw new Error('PASSE_INVALIDO');

  let chave: ItemAberto | undefined = item.entrada?.app_id === appId ? item : undefined;
  if (!chave) {
    const passeDeCadastro = await passeDeCadastroPeloItem(item, appId);
    const cadastro = await cofreApi.pedidoDeEntrada(passeDeCadastro);
    if (cadastro.acao !== 'cadastro' || cadastro.app.id !== appId) throw new Error('PASSE_INVALIDO');
    await cofre.guardarEntrada(passeDeCadastro, cadastro, nomeDoAparelho());
    chave = cofre.entradasDoApp(appId).find((i) => i.entrada?.usuario_id === cadastro.conta?.id);
    if (!chave) throw new Error('SEM_ENTRADA');
  }

  const { entrada_id, assinatura } = await cofre.assinarParaEntrar(chave, passe);
  const url = new URL('/entrar', pedido.app.origem);
  url.hash = new URLSearchParams({ 'cofre-passe': passe, 'cofre-entrada': entrada_id, 'cofre-assinatura': assinatura }).toString();
  cofre.trancar();
  window.location.assign(url.toString());
}
