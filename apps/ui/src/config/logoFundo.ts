/**
 * Fundo do quadro do logo, por aplicativo.
 *
 * O padrão é branco: quase todo logo do painel foi feito para fundo claro. O
 * da Sul Alimentos não — é o traçado oficial, branco com contorno vinho, pensado
 * para fundo preto (04/11/2026, pedido do dono). No branco sobrava só o
 * contorno.
 *
 * Chave = id do aplicativo no LoginHUB, a mesma de `config/provisioning.ts`.
 */
const FUNDO_ESCURO = new Set(['2']);

export const fundoDoLogo = (appId: string | number | undefined | null): string =>
  appId != null && FUNDO_ESCURO.has(String(appId)) ? 'bg-black' : 'bg-white';
