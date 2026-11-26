import { watchEffect } from 'vue'
import { useI18n } from '@/i18n'

const SITE_URL = 'https://loginhub.astralwavelabel.com/'

function setMeta(selector: string, attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = value
}

// SEO no cliente para acompanhar a troca de idioma. O que os crawlers sem JS
// leem já está estático no index.html — isto aqui só corrige quando o visitante
// muda para inglês, e mantém o <html lang> coerente com o conteúdo.
export function useSeo() {
  const { t, locale } = useI18n()

  watchEffect(() => {
    document.title = t.value.meta.title
    document.documentElement.lang = locale.value

    setMeta('meta[name="description"]', 'name', 'description', t.value.meta.description)
    setMeta('meta[property="og:title"]', 'property', 'og:title', t.value.meta.title)
    setMeta('meta[property="og:description"]', 'property', 'og:description', t.value.meta.description)
    setMeta('meta[property="og:locale"]', 'property', 'og:locale', t.value.meta.ogLocale)
    setMeta('meta[property="og:url"]', 'property', 'og:url', SITE_URL)
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', t.value.meta.title)
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', t.value.meta.description)
  })
}
