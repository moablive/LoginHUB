import { computed, ref } from 'vue'
import ptBR, { type Messages } from './pt-BR'
import en from './en'

// i18n próprio, sem vue-i18n: a LP é estática, tem dois idiomas e nenhuma
// pluralização ou formatação de número. Uma dependência a menos no bundle, e o
// `t` continua tipado — `t.hero.titl` não compila.
export type Locale = 'pt-BR' | 'en'

// `-v2`: a chave antiga guardava também o idioma que o `navigator.language`
// tinha adivinhado, indistinguível de escolha do visitante. Quem caiu no inglês
// por ter o sistema em en-US continuaria em inglês para sempre; o v2 descarta
// aquilo e só grava o que sai do seletor ou de `?lang=`.
const STORAGE_KEY = 'aw-security-locale-v2'

const dictionaries: Record<Locale, Messages> = {
  'pt-BR': ptBR,
  en,
}

function fromQuery(): Locale | null {
  const lang = new URLSearchParams(window.location.search).get('lang')?.toLowerCase()
  if (!lang) return null
  if (lang.startsWith('pt')) return 'pt-BR'
  if (lang.startsWith('en')) return 'en'
  return null
}

function detect(): Locale {
  // `?lang=` na frente de tudo: é a URL que o hreflang do index.html anuncia
  // como versão em inglês, e link explícito vale mais que preferência antiga.
  const fromUrl = fromQuery()
  if (fromUrl) return fromUrl
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'pt-BR' || saved === 'en') return saved
  // Português é o padrão da página, seja qual for o idioma do navegador: o
  // público é brasileiro e o index.html já serve SEO em PT-BR. Sniffar
  // `navigator.language` mandava visitante daqui para o inglês só porque o
  // sistema estava em en-US — o inglês agora entra pelo seletor ou por
  // `?lang=en`.
  return 'pt-BR'
}

// Estado no módulo: um único idioma para o app inteiro, sem provide/inject.
const locale = ref<Locale>('pt-BR')

export function initLocale() {
  // `persist: false` para o padrão não virar preferência gravada: só escolha
  // explícita (seletor ou `?lang=`) sobrevive à sessão.
  const fromUrl = fromQuery()
  setLocale(detect(), fromUrl !== null)
}

export function setLocale(next: Locale, persist = true) {
  locale.value = next
  if (persist) localStorage.setItem(STORAGE_KEY, next)
  document.documentElement.lang = next
}

export function useI18n() {
  const t = computed(() => dictionaries[locale.value])
  return { t, locale, setLocale }
}
