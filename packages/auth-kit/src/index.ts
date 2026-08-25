/**
 * Barril do auth-kit.
 *
 * Os apps clientes NÃO consomem este pacote por npm: eles recebem uma cópia
 * dos arquivos de `src/` pelo `scripts/sync-auth-kit.sh`. O pacote existe para
 * que o monorepo do hub compile e typecheque a fonte canônica — se algo aqui
 * quebra, quebra antes de ser propagado para os 8 apps.
 */
export * from './hubAuthServer';
export * from './hubAuthClient';
