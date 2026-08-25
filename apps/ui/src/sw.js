// Service worker do LoginHUB — deliberadamente SEM cache e SEM handler de fetch.
//
// POR QUE ELE EXISTE ASSIM
//
// A config anterior usava o `generateSW` padrão do vite-plugin-pwa, que é
// Workbox com **precache do app shell** e `navigateFallback`. Como o hub roda
// `vite dev` em produção (atrás do túnel) e `devOptions.enabled` estava ligado,
// esse SW ia para o navegador de todo mundo e passava a servir o index e os
// chunks do CACHE.
//
// O efeito prático: quem já tinha aberto o painel antes continuava recebendo a
// versão antiga do app. Quando a rota `/enrolar-2fa` foi criada, esses
// navegadores não a conheciam — a navegação caía no `<Route path="*">` e ia
// parar no login do hub. Do lado do servidor estava tudo certo; num navegador
// limpo funcionava. É o mesmo "build presa" que o TodoAPP já tinha diagnosticado
// e resolvido do mesmo jeito.
//
// Sem fetch handler, toda navegação vai direto à rede, como numa página comum.
// O manifest continua fazendo o app ser instalável — é o precache que
// atrapalhava, não o SW em si.

self.addEventListener('install', () => {
    // Assume o controle sem esperar as abas antigas fecharem: quem está preso
    // numa versão velha precisa sair dela agora, não no próximo reinício do
    // navegador.
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Apaga TODO cache — inclusive o precache do Workbox que a versão anterior
    // deste SW deixou para trás. É o que desfaz o estrago em quem já está com
    // o app antigo guardado.
    event.waitUntil(
        caches.keys().then((chaves) => Promise.all(chaves.map((k) => caches.delete(k)))),
    );
    event.waitUntil(self.clients.claim());
});
