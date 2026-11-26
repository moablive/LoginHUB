<script setup lang="ts">
import { ArrowRight, LogIn, ShieldCheck } from 'lucide-vue-next'
import { useI18n } from '@/i18n'
import VaultVisual from './VaultVisual.vue'
import { useCheckout } from '@/composables/useCheckout'
import { LOGIN_URL } from '@/links'

const { t } = useI18n()
const { irParaFormulario } = useCheckout()
</script>

<template>
  <section id="topo" class="relative overflow-hidden pt-32 pb-20 md:pt-40 md:pb-28">
    <div class="absolute inset-0 aw-glow" aria-hidden="true"></div>
    <div class="absolute inset-0 aw-grid-bg opacity-70" aria-hidden="true"></div>

    <div class="aw-container relative grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
      <div>
        <span
          class="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1.5 text-xs font-semibold text-accent"
        >
          <ShieldCheck class="h-3.5 w-3.5" />
          {{ t.hero.badge }}
        </span>

        <h1 class="mt-6 text-[clamp(2.4rem,1.4rem+3.6vw,4rem)] font-extrabold leading-[1.05] tracking-tight">
          <span class="aw-text-gradient">{{ t.hero.title }}</span>
        </h1>

        <p class="aw-lead mt-6 text-[1.1rem]">{{ t.hero.subtitle }}</p>

        <div class="mt-9 flex flex-wrap gap-3">
          <button class="aw-btn aw-btn-primary" @click="irParaFormulario">
            {{ t.hero.ctaPrimary }}
            <ArrowRight class="h-4 w-4" />
          </button>
          <a :href="LOGIN_URL" class="aw-btn aw-btn-ghost">
            <LogIn class="h-4 w-4" />
            {{ t.hero.ctaLogin }}
          </a>
        </div>

        <dl class="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-border-soft pt-7">
          <div v-for="stat in t.hero.stats" :key="stat.label">
            <dt class="text-xl font-bold tracking-tight md:text-2xl">{{ stat.value }}</dt>
            <dd class="mt-1 text-xs leading-snug text-muted">{{ stat.label }}</dd>
          </div>
        </dl>
      </div>

      <VaultVisual />
    </div>
  </section>
</template>
