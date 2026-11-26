<script setup lang="ts">
import { ExternalLink, Fingerprint, KeyRound, Lock, ShieldCheck, Smartphone } from 'lucide-vue-next'
import { useI18n } from '@/i18n'
import { LOGINHUB_URL } from '@/links'
import SectionHeading from './SectionHeading.vue'

const { t } = useI18n()

// As telas são desenhadas aqui (HTML + SVG), não capturas do app: nenhuma senha,
// e-mail ou código real do cofre pode aparecer numa página pública. Os textos
// vêm do dicionário (`showcase.*`) para acompanhar o idioma.
const digitos = ['4', '8', '2', '', '', '']
const codigo = '482 913'
</script>

<template>
  <section id="app" class="aw-section border-t border-border-soft">
    <div class="aw-container">
      <SectionHeading
        center
        :kicker="t.showcase.kicker"
        :title="t.showcase.title"
        :lead="t.showcase.lead"
      />

      <!-- Três telas em moldura de celular. A do meio sobe um pouco: é o cofre,
           o que a pessoa compra. -->
      <div class="mt-14 grid items-start gap-10 sm:grid-cols-3 sm:gap-6">
        <figure v-for="(screen, i) in t.showcase.screens" :key="screen.caption" class="mx-auto w-full max-w-[15rem]" :class="i === 1 ? 'sm:-mt-6' : ''">
          <div class="rounded-[2.2rem] border border-border-soft bg-surface-2 p-2.5 shadow-2xl">
            <div class="relative h-[26rem] overflow-hidden rounded-[1.7rem] bg-bg" aria-hidden="true">
              <!-- ilha do relógio -->
              <span class="absolute left-1/2 top-2 h-1.5 w-16 -translate-x-1/2 rounded-full bg-border-soft"></span>

              <!-- 1. Entrada com Google Authenticator -->
              <div v-if="i === 0" class="flex h-full flex-col px-5 pb-6 pt-12">
                <span class="aw-icon !h-11 !w-11 !rounded-xl"><ShieldCheck class="h-5 w-5" /></span>
                <p class="mt-5 text-lg font-bold tracking-tight">{{ t.showcase.login.title }}</p>
                <p class="mt-1 text-[0.7rem] leading-snug text-muted">{{ t.showcase.login.hint }}</p>
                <p class="mt-6 text-[0.7rem] font-medium text-muted">{{ t.showcase.login.field }}</p>
                <div class="mt-2 flex gap-1.5">
                  <span
                    v-for="(d, n) in digitos"
                    :key="n"
                    class="flex h-10 flex-1 items-center justify-center rounded-lg border bg-surface text-base font-bold"
                    :class="d ? 'border-accent/60 text-fg' : 'border-border-soft text-muted'"
                  >{{ d }}</span>
                </div>
                <span class="aw-btn aw-btn-primary mt-auto !w-full !py-2.5 text-sm">{{ t.showcase.login.button }}</span>
              </div>

              <!-- 2. Meu cofre -->
              <div v-else-if="i === 1" class="flex h-full flex-col px-4 pb-5 pt-12">
                <div class="flex items-center justify-between">
                  <p class="text-lg font-bold tracking-tight">{{ t.showcase.vault.title }}</p>
                  <Fingerprint class="h-5 w-5 text-accent" />
                </div>
                <p class="mt-1 flex items-center gap-1.5 text-[0.65rem] uppercase tracking-widest text-muted">
                  <Lock class="h-3 w-3" /> {{ t.showcase.vault.lock }}
                </p>
                <ul class="mt-5 space-y-2">
                  <li
                    v-for="entry in t.showcase.vault.entries"
                    :key="entry"
                    class="flex items-center justify-between rounded-lg border border-border-soft bg-surface px-3 py-2.5"
                  >
                    <span class="flex items-center gap-2 truncate text-xs font-medium">
                      <KeyRound class="h-3.5 w-3.5 shrink-0 text-accent" />{{ entry }}
                    </span>
                    <span class="font-mono text-[0.65rem] tracking-[0.2em] text-muted">••••</span>
                  </li>
                </ul>
              </div>

              <!-- 3. Código 2FA ao vivo -->
              <div v-else class="flex h-full flex-col px-4 pb-5 pt-12">
                <p class="text-lg font-bold tracking-tight">{{ t.showcase.code.title }}</p>
                <p class="mt-1 truncate text-xs text-muted">{{ t.showcase.code.user }}</p>
                <div class="mt-5 rounded-xl border border-border-soft bg-surface px-4 py-5 text-center">
                  <p class="text-[0.65rem] uppercase tracking-widest text-muted">{{ t.showcase.code.label }}</p>
                  <p class="mt-2 whitespace-nowrap font-mono text-[1.65rem] font-bold tracking-[0.1em] text-accent">{{ codigo }}</p>
                  <div class="mx-auto mt-4 h-1.5 w-full overflow-hidden rounded-full bg-border-soft">
                    <div class="h-full w-3/5 rounded-full bg-accent"></div>
                  </div>
                  <p class="mt-2 text-[0.65rem] text-muted">{{ t.showcase.code.renews }}</p>
                </div>
              </div>
            </div>
          </div>
          <figcaption class="mt-4 text-center text-sm font-medium text-muted">{{ screen.caption }}</figcaption>
        </figure>
      </div>

      <!-- Instalação no celular -->
      <div class="mx-auto mt-20 max-w-4xl">
        <div class="text-center">
          <span class="aw-icon mx-auto"><Smartphone class="h-5 w-5" /></span>
          <h3 class="mt-4 text-xl font-bold tracking-tight">{{ t.showcase.install.title }}</h3>
          <p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{{ t.showcase.install.lead }}</p>
        </div>

        <div class="mt-8 grid gap-6 md:grid-cols-2">
          <article class="aw-card">
            <h4 class="text-base font-semibold tracking-tight">{{ t.showcase.install.android.name }}</h4>
            <ol class="mt-4 space-y-3">
              <li v-for="(step, n) in t.showcase.install.android.steps" :key="step" class="flex gap-3 text-sm text-muted">
                <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">{{ n + 1 }}</span>
                <span class="pt-0.5 leading-relaxed">{{ step }}</span>
              </li>
            </ol>
          </article>
          <article class="aw-card">
            <h4 class="text-base font-semibold tracking-tight">{{ t.showcase.install.ios.name }}</h4>
            <ol class="mt-4 space-y-3">
              <li v-for="(step, n) in t.showcase.install.ios.steps" :key="step" class="flex gap-3 text-sm text-muted">
                <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">{{ n + 1 }}</span>
                <span class="pt-0.5 leading-relaxed">{{ step }}</span>
              </li>
            </ol>
          </article>
        </div>

        <div class="mt-8 text-center">
          <a :href="LOGINHUB_URL" class="aw-btn aw-btn-ghost">
            {{ t.showcase.install.open }}
            <ExternalLink class="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  </section>
</template>
