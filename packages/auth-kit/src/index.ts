/**
 * Barril do auth-kit.
 *
 * Os apps clientes NÃO consomem este pacote por npm: eles recebem uma cópia
 * dos arquivos de `src/` pelo `scripts/sync-auth-kit.sh`. O pacote existe para
 * que o monorepo do hub compile e typecheque a fonte canônica — se algo aqui
 * quebra, quebra antes de ser propagado para os apps e bots.
 */
export * from './hubAuthServer';
export * from './hubAuthClient';

// Nomeados, e não `export *`: o `hubAuthBot` reexporta `HubApiError` e os tipos
// do cliente para que um bot importe de um lugar só, e duas estrelas exportando
// o mesmo nome é ambiguidade de módulo.
export {
    criarHubAuthBot,
    ehCodigoTotp,
    type HubAuthBot,
    type HubAuthBotConfig,
    type DonoDaSessao,
} from './hubAuthBot';
