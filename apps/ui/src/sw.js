// Service worker do LoginHUB: deixa o app abrir sem rede (25/11/2026, pedido do dono: cofre offline no iPhone).
//
// O que ele guarda, e só isto:
//  - /assets/* e /fontes/*: arquivos do build com hash no nome. Um arquivo com aquele nome nunca muda, então
//    servir do cache é seguro e NÃO prende ninguém numa versão velha (o problema do precache antigo, que servia
//    index e chunks velhos, vinha do index e dos chunks sem hash).
//  - o index.html: sempre REDE PRIMEIRO. O cache dele só entra quando a rede falha (sem internet ou mais de
//    PRAZO_REDE_MS sem resposta). Com rede, a versão nova aparece na hora.
//
// Nunca toca em /api, em outro host nem em método diferente de GET: os dados do cofre vêm cifrados do servidor e a
// cópia deles mora no IndexedDB (features/cofre/local.ts), não aqui.

const CACHE = 'loginhub-shell-v1';
const INDEX = '/index.html';
const PRAZO_REDE_MS = 4000;

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Apaga qualquer cache que não seja o atual (inclusive o precache do Workbox de versões antigas).
    event.waitUntil(
        caches.keys().then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
    );
    event.waitUntil(self.clients.claim());
});

const comPrazo = (promessa, ms) =>
    new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('PRAZO')), ms);
        promessa.then(
            (r) => {
                clearTimeout(t);
                resolve(r);
            },
            (e) => {
                clearTimeout(t);
                reject(e);
            },
        );
    });

async function navegacao(request) {
    const cache = await caches.open(CACHE);
    try {
        const resposta = await comPrazo(fetch(request), PRAZO_REDE_MS);
        // O app é uma SPA: qualquer rota abre o mesmo index. Só guarda resposta boa de HTML.
        if (resposta.ok && (resposta.headers.get('content-type') || '').includes('text/html')) {
            await cache.put(INDEX, resposta.clone());
        }
        return resposta;
    } catch (e) {
        const guardado = await cache.match(INDEX);
        if (guardado) return guardado;
        throw e;
    }
}

async function arquivoComHash(request) {
    const cache = await caches.open(CACHE);
    const guardado = await cache.match(request);
    if (guardado) return guardado;
    const resposta = await fetch(request);
    if (resposta.ok) await cache.put(request, resposta.clone());
    return resposta;
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api')) return;

    if (request.mode === 'navigate') {
        event.respondWith(navegacao(request));
        return;
    }
    if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fontes/')) {
        event.respondWith(arquivoComHash(request));
    }
});
