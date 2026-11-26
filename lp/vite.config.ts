import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// A LP é estática salvo por um ponto: a assinatura do LoginHUB, que fala com
// /api/venda/ do próprio LoginHUB. Em produção quem repassa é o nginx dela; no
// dev server, este proxy.
const loginhubTarget = process.env.DEV_LOGINHUB_TARGET ?? 'https://loginhub.astralwavelabel.com'

// A LP mora dentro do LoginHUB: loginhub.astralwavelabel.com/assine/ (o nginx do hub repassa
// o prefixo para este container). Por isso os assets saem com base `/assine/`.
export default defineConfig({
  base: '/assine/',
  plugins: [
    vue(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // A LP inteira cabe num bundle só; dividir aqui só acrescentaria round-trips.
    cssCodeSplit: false,
    // Ícones lucide são a única dependência pesada, e vêm tree-shaken.
    chunkSizeWarningLimit: 600,
  },
  server: {
    // host: escuta em 0.0.0.0 — sem isso o mapeamento de porta do Docker não pega.
    host: true,
    port: 5176,
    // O Vite bloqueia Host header desconhecido; necessário atrás do túnel/domínio.
    allowedHosts: true,
    proxy: {
      '/api/venda': loginhubTarget,
    },
    fs: {
      allow: ['.'],
      // O bind mount expõe a raiz do repo dentro do container de dev. Um `allow`
      // amplo não pode virar leitura de segredo pela web.
      deny: ['.env', '.env.*', '**/.env', '**/.env.*', '*.{crt,pem,key}', '**/.git/**'],
    },
  },
})
