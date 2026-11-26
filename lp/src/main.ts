import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { initLocale } from './i18n'

// Idioma antes do mount: evita a LP pintar em português e trocar para inglês
// no frame seguinte para quem já escolheu EN.
initLocale()

// A LP é a home do LoginHUB (loginhub.astralwavelabel.com/). Quem abre o app JÁ INSTALADO na tela
// inicial quer o painel/cofre, não a página de venda: vai direto para o app (a guarda dele leva ao
// login se não houver sessão). O navegador comum continua vendo a LP, com o botão Entrar.
const instalado =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true
if (instalado && window.location.pathname === '/') window.location.replace('/dashboard')

// Plausible self-hosted, opcional. Sem VITE_PLAUSIBLE_DOMAIN no .env não existe
// script nenhum na página — a LP promete zero telemetria, e o padrão tem de
// honrar isso.
const plausibleDomain = import.meta.env.VITE_PLAUSIBLE_DOMAIN
if (plausibleDomain) {
  const host = import.meta.env.VITE_PLAUSIBLE_HOST ?? 'https://plausible.io'
  const script = document.createElement('script')
  script.defer = true
  script.dataset.domain = plausibleDomain
  script.src = `${host}/js/script.js`
  document.head.appendChild(script)
}

createApp(App).mount('#app')

// Sem service worker próprio: a LP mora dentro do LoginHUB (que já é o PWA instalável). Um SW
// registrado aqui disputaria o escopo `/` com o do hub.
