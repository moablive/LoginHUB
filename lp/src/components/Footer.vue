<script setup lang="ts">
import { Shield } from 'lucide-vue-next'
import { useI18n } from '@/i18n'
import {
  ARTIST_URL,
  CONTACT_URL,
  LABEL_URL,
  LOGINHUB_URL,
  PRIVACY_URL,
  STORE_URL,
  TERMS_URL,
} from '@/links'

const { t } = useI18n()

const year = new Date().getFullYear()
</script>

<template>
  <footer class="border-t border-border-soft bg-surface/60">
    <div class="aw-container grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
      <div>
        <a href="#topo" class="flex items-center gap-2.5 font-bold tracking-tight">
          <span class="aw-icon !h-9 !w-9 !rounded-lg"><Shield class="h-4.5 w-4.5" /></span>
          <span class="text-[0.95rem] leading-tight">
            LoginHUB
            <span class="block text-[0.62rem] font-medium uppercase tracking-[0.16em] text-muted">Technology Astrał wave</span>
          </span>
        </a>
        <p class="mt-5 max-w-xs text-sm leading-relaxed text-muted">{{ t.footer.tagline }}</p>
      </div>

      <div>
        <h2 class="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{{ t.footer.product }}</h2>
        <ul class="mt-4 space-y-2.5 text-sm">
          <li><a href="#recursos" class="text-muted transition-colors hover:text-fg">{{ t.footer.links.features }}</a></li>
          <li><a href="#preco" class="text-muted transition-colors hover:text-fg">{{ t.footer.links.pricing }}</a></li>
          <li><a :href="LOGINHUB_URL" class="text-muted transition-colors hover:text-fg">{{ t.footer.links.app }}</a></li>
        </ul>
      </div>

      <div>
        <h2 class="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{{ t.footer.company }}</h2>
        <ul class="mt-4 space-y-2.5 text-sm">
          <li><a :href="LABEL_URL" class="text-muted transition-colors hover:text-fg">{{ t.footer.links.label }}</a></li>
          <li><a :href="STORE_URL" class="text-muted transition-colors hover:text-fg">{{ t.footer.links.store }}</a></li>
          <li><a :href="ARTIST_URL" class="text-muted transition-colors hover:text-fg">{{ t.footer.links.artist }}</a></li>
          <li><a :href="CONTACT_URL" class="text-muted transition-colors hover:text-fg">{{ t.footer.links.contact }}</a></li>
        </ul>
      </div>

      <div>
        <h2 class="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{{ t.footer.legal }}</h2>
        <ul class="mt-4 space-y-2.5 text-sm">
          <li><a :href="PRIVACY_URL" class="text-muted transition-colors hover:text-fg">{{ t.footer.links.privacy }}</a></li>
          <li><a :href="TERMS_URL" class="text-muted transition-colors hover:text-fg">{{ t.footer.links.terms }}</a></li>
        </ul>
      </div>
    </div>

    <div class="border-t border-border-soft">
      <div class="aw-container flex flex-col items-center justify-between gap-3 py-6 text-xs text-muted sm:flex-row">
        <p>© {{ year }} Astrał wave Label. {{ t.footer.rights }}</p>
        <p class="rounded-full border border-border-soft px-3 py-1.5">{{ t.footer.badge }}</p>
      </div>
    </div>
  </footer>
</template>
