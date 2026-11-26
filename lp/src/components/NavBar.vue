<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { ExternalLink, LayoutGrid, Languages, Menu, Moon, Shield, Sun, X } from 'lucide-vue-next'
import { useI18n } from '@/i18n'
import { useTheme } from '@/composables/useTheme'
import { useCheckout } from '@/composables/useCheckout'
import { LOGIN_URL, PRODUCTS } from '@/links'

const { t, locale, setLocale } = useI18n()
const { theme, toggle } = useTheme()
// Todo CTA da página leva ao mesmo formulário, que fica visível na seção de
// preço. Este aqui já foi um link cru para #preco: rolava até o card e parava
// ali, sem levar o cursor para o primeiro campo.
const { irParaFormulario } = useCheckout()

const open = ref(false)
const scrolled = ref(false)

const links = [
  { href: '#destaques', key: 'features' },
  { href: '#app', key: 'app' },
  { href: '#como-funciona', key: 'how' },
  { href: '#seguranca', key: 'security' },
  { href: '#preco', key: 'pricing' },
] as const

const onScroll = () => {
  scrolled.value = window.scrollY > 12
}

// Seletor de produtos: quem chega pela LP não sabe que a Astrał wave é também
// gravadora e loja. Fecha ao clicar fora e no Escape, como qualquer menu.
const productsOpen = ref(false)
const productsRef = ref<HTMLElement | null>(null)
const closeProducts = () => { productsOpen.value = false }
const onDocClick = (e: MouseEvent) => {
  if (productsOpen.value && productsRef.value && !productsRef.value.contains(e.target as Node)) closeProducts()
}
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') { closeProducts(); open.value = false }
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})

const switchLocale = () => setLocale(locale.value === 'pt-BR' ? 'en' : 'pt-BR')
</script>

<template>
  <header
    class="fixed inset-x-0 top-0 z-50 transition-colors duration-300"
    :class="scrolled || open ? 'bg-bg/85 backdrop-blur-xl border-b border-border-soft' : 'border-b border-transparent'"
  >
    <nav class="aw-container flex h-16 items-center justify-between gap-4">
      <a href="#topo" class="flex items-center gap-2.5 font-bold tracking-tight">
        <span class="aw-icon !h-9 !w-9 !rounded-lg">
          <Shield class="h-4.5 w-4.5" />
        </span>
        <span class="text-[0.95rem] leading-tight">
          LoginHUB
          <span class="block text-[0.62rem] font-medium uppercase tracking-[0.16em] text-muted">Technology Astrał wave</span>
        </span>
      </a>

      <ul class="hidden items-center gap-7 lg:flex">
        <li v-for="link in links" :key="link.href">
          <a
            :href="link.href"
            class="text-sm font-medium text-muted transition-colors hover:text-fg"
          >{{ t.nav[link.key] }}</a>
        </li>
      </ul>

      <div class="flex items-center gap-2">
        <!-- Seletor de produtos (desktop) -->
        <div ref="productsRef" class="relative hidden lg:block">
          <button
            type="button"
            class="aw-btn aw-btn-ghost !px-3 !py-2 text-xs"
            :class="productsOpen ? '!border-accent/60' : ''"
            aria-haspopup="menu"
            :aria-expanded="productsOpen"
            aria-controls="menu-products"
            @click="productsOpen = !productsOpen"
          >
            <LayoutGrid class="h-4 w-4" aria-hidden="true" />
            <span class="font-semibold">{{ t.nav.products }}</span>
          </button>

          <div
            v-if="productsOpen"
            id="menu-products"
            role="menu"
            :aria-label="t.products.title"
            class="absolute right-0 top-[calc(100%+0.6rem)] w-[22rem] overflow-hidden rounded-xl border border-border-soft bg-bg shadow-[0_18px_40px_-20px_rgba(0,0,0,0.5)]"
          >
            <p class="px-4 pb-2 pt-3 text-xs text-muted">{{ t.products.title }}</p>
            <template v-for="p in PRODUCTS" :key="p.id">
              <a
                v-if="p.id === 'security'"
                href="#topo"
                role="menuitem"
                aria-current="true"
                class="block border-t border-border-soft px-4 py-3 transition-colors hover:bg-surface"
                @click="closeProducts"
              >
                <span class="text-sm font-semibold">{{ t.products[p.id].name }}<span class="ml-2 text-[0.7rem] font-medium text-accent">{{ t.products.here }}</span></span>
                <span class="mt-0.5 block text-xs leading-relaxed text-muted">{{ t.products[p.id].desc }}</span>
              </a>
              <a
                v-else
                :href="p.url"
                role="menuitem"
                target="_blank"
                rel="noopener noreferrer"
                class="block border-t border-border-soft px-4 py-3 transition-colors hover:bg-surface"
                @click="closeProducts"
              >
                <span class="text-sm font-semibold">{{ t.products[p.id].name }}<ExternalLink class="ml-1.5 inline h-3 w-3 opacity-60" aria-hidden="true" /></span>
                <span class="mt-0.5 block text-xs leading-relaxed text-muted">{{ t.products[p.id].desc }}</span>
              </a>
            </template>
          </div>
        </div>

        <button
          class="aw-btn aw-btn-ghost !px-2.5 !py-2 text-xs"
          :aria-label="t.nav.lang"
          :title="t.nav.lang"
          @click="switchLocale"
        >
          <Languages class="h-4 w-4" />
          <span class="font-semibold">{{ locale === 'pt-BR' ? 'PT' : 'EN' }}</span>
        </button>

        <button
          class="aw-btn aw-btn-ghost !px-2.5 !py-2"
          :aria-label="t.nav.theme"
          :title="t.nav.theme"
          @click="toggle"
        >
          <Sun v-if="theme === 'dark'" class="h-4 w-4" />
          <Moon v-else class="h-4 w-4" />
        </button>

        <!-- Como na home do 1Password: Entrar (abre o app completo) ao lado do CTA principal. -->
        <a :href="LOGIN_URL" class="aw-btn aw-btn-ghost hidden !py-2 text-sm font-semibold sm:inline-flex">{{ t.nav.login }}</a>
        <button class="aw-btn aw-btn-primary hidden sm:inline-flex" @click="irParaFormulario">{{ t.nav.cta }}</button>

        <button
          class="aw-btn aw-btn-ghost !px-2.5 !py-2 lg:hidden"
          :aria-label="t.nav.menu"
          :aria-expanded="open"
          @click="open = !open"
        >
          <X v-if="open" class="h-4 w-4" />
          <Menu v-else class="h-4 w-4" />
        </button>
      </div>
    </nav>

    <div v-if="open" class="lg:hidden max-h-[calc(100dvh-4rem)] overflow-y-auto">
      <ul class="aw-container flex flex-col gap-1 pb-5">
        <li v-for="link in links" :key="link.href">
          <a
            :href="link.href"
            class="block rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-fg"
            @click="open = false"
          >{{ t.nav[link.key] }}</a>
        </li>
        <li class="grid grid-cols-2 gap-2 pt-2">
          <a :href="LOGIN_URL" class="aw-btn aw-btn-ghost w-full">{{ t.nav.login }}</a>
          <button class="aw-btn aw-btn-primary w-full" @click="open = false; irParaFormulario()">{{ t.nav.cta }}</button>
        </li>

        <!-- No celular o seletor vira uma seção do próprio menu. -->
        <li class="mt-3 border-t border-border-soft pt-3">
          <p class="px-3 pb-1 text-xs text-muted">{{ t.products.title }}</p>
          <template v-for="p in PRODUCTS" :key="p.id">
            <a
              v-if="p.id === 'security'"
              href="#topo"
              aria-current="true"
              class="block rounded-lg px-3 py-2.5 transition-colors hover:bg-surface"
              @click="open = false"
            >
              <span class="text-sm font-semibold">{{ t.products[p.id].name }}<span class="ml-2 text-[0.7rem] font-medium text-accent">{{ t.products.here }}</span></span>
              <span class="block text-xs leading-relaxed text-muted">{{ t.products[p.id].desc }}</span>
            </a>
            <a
              v-else
              :href="p.url"
              target="_blank"
              rel="noopener noreferrer"
              class="block rounded-lg px-3 py-2.5 transition-colors hover:bg-surface"
              @click="open = false"
            >
              <span class="text-sm font-semibold">{{ t.products[p.id].name }}<ExternalLink class="ml-1.5 inline h-3 w-3 opacity-60" aria-hidden="true" /></span>
              <span class="block text-xs leading-relaxed text-muted">{{ t.products[p.id].desc }}</span>
            </a>
          </template>
        </li>
      </ul>
    </div>
  </header>
</template>
