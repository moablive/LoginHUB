import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Onde o dev server manda as chamadas /api. No Docker o compose aponta para o
// container do backend; rodando na mão o padrão é a API local.
const apiProxyTarget = process.env.API_PROXY_TARGET || 'http://localhost:3000'

// Atrás do túnel Cloudflare o browser fala HTTPS/443, não a porta interna em
// que o vite escuta — o client de HMR precisa saber disso ou nunca conecta.
// Sem as variáveis (dev na máquina local) vale o comportamento padrão do vite.
const hmrClientPort = process.env.VITE_HMR_CLIENT_PORT
const hmr = hmrClientPort
  ? {
      clientPort: Number(hmrClientPort),
      protocol: process.env.VITE_HMR_PROTOCOL || 'wss',
    }
  : undefined

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      manifest: {
        name: 'LoginHub',
        short_name: 'LoginHub',
        description: 'LoginHub Manager Application',
        theme_color: '#2563EB',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ],
  envDir: '../../',
  server: {
    // Bind em 0.0.0.0: sem isto o vite só escuta em localhost e o container
    // fica inalcançável de fora.
    host: true,
    // O painel é servido pelo domínio público da Cloudflare; sem isto o vite
    // responde "Blocked request. This host is not allowed."
    allowedHosts: true,
    hmr,
    // Painel e API dividem o mesmo hostname (VITE_API_URL = <host>/api). Quem
    // fazia esse desvio era o nginx (apps/ui/nginx.conf); com o dev server no
    // lugar dele, o proxy é aqui. A API monta tudo sob /api
    // (app.use('/api', router)), então o prefixo é PRESERVADO no upstream.
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
    fs: {
      // A UI importa @loginhub/api-client de packages/*/dist, fora da raiz do
      // app.
      allow: ['../..'],
      // O bind mount expõe a raiz do repo dentro do container. O vite já nega
      // .env por padrão, mas aqui é explícito: um `allow` amplo não pode virar
      // leitura de segredo pela web.
      deny: ['.env', '.env.*', '**/.env', '**/.env.*', '*.{crt,pem,key}', '**/.git/**'],
    },
  },
})
