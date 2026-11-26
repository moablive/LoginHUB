<script setup lang="ts">
import { Check, Fingerprint, KeyRound, Lock, ShieldCheck, Smartphone, Users } from 'lucide-vue-next'
import { useI18n } from '@/i18n'
import { useCheckout } from '@/composables/useCheckout'

const { t } = useI18n()
const { irParaFormulario } = useCheckout()

// As imagens são desenhadas aqui (HTML + SVG): nenhum dado real do cofre aparece numa página pública.
const cofre = ['Instagram @suamarca', 'Meta Business Suite', 'Google Ads', 'Banco · acesso PJ']
</script>

<template>
  <section id="destaques" class="aw-section">
    <div class="aw-container space-y-24 md:space-y-32">
      <div
        v-for="(row, i) in t.highlights"
        :key="row.id"
        class="grid items-center gap-10 md:grid-cols-2 md:gap-16"
      >
        <!-- Texto: alterna de lado a cada linha, como nas seções da home do 1Password. -->
        <div :class="i % 2 === 1 ? 'md:order-2' : ''">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-accent">{{ row.kicker }}</p>
          <h2 class="aw-title mt-3">{{ row.title }}</h2>
          <p class="aw-lead mt-5">{{ row.body }}</p>
          <ul class="mt-6 space-y-2.5">
            <li v-for="p in row.points" :key="p" class="flex gap-2.5 text-sm">
              <Check class="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span class="text-muted">{{ p }}</span>
            </li>
          </ul>
          <button v-if="i === 0" class="aw-btn aw-btn-primary mt-8" @click="irParaFormulario">{{ t.finalCta.buy }}</button>
        </div>

        <!-- Imagem -->
        <div :class="i % 2 === 1 ? 'md:order-1' : ''" aria-hidden="true">
          <div class="relative">
            <div class="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-accent/20 to-accent-2/10 blur-2xl"></div>
            <div class="relative rounded-xl2 border border-border-soft bg-surface/95 p-5 shadow-2xl">
              <!-- cofre -->
              <template v-if="row.id === 'vault'">
                <div class="flex items-center gap-2.5 border-b border-border-soft pb-4">
                  <span class="aw-icon !h-9 !w-9 !rounded-lg"><Lock class="h-4 w-4" /></span>
                  <div>
                    <p class="text-sm font-semibold">{{ t.showcase.vault.title }}</p>
                    <p class="text-[0.7rem] uppercase tracking-widest text-muted">{{ t.showcase.vault.lock }}</p>
                  </div>
                </div>
                <ul class="mt-4 space-y-2.5">
                  <li v-for="e in cofre" :key="e" class="flex items-center justify-between rounded-lg border border-border-soft bg-surface-2/70 px-3.5 py-3">
                    <span class="flex items-center gap-2.5 text-sm font-medium"><KeyRound class="h-4 w-4 text-accent" />{{ e }}</span>
                    <span class="font-mono text-xs tracking-[0.2em] text-muted">••••••••</span>
                  </li>
                </ul>
              </template>

              <!-- 2FA -->
              <template v-else-if="row.id === 'totp'">
                <div class="flex items-center gap-2.5 border-b border-border-soft pb-4">
                  <span class="aw-icon !h-9 !w-9 !rounded-lg"><ShieldCheck class="h-4 w-4" /></span>
                  <p class="text-sm font-semibold">{{ t.showcase.code.title }}</p>
                </div>
                <div class="mt-5 rounded-xl border border-border-soft bg-surface-2/70 px-4 py-6 text-center">
                  <p class="text-[0.7rem] uppercase tracking-widest text-muted">{{ t.showcase.code.label }}</p>
                  <p class="mt-2 whitespace-nowrap font-mono text-4xl font-bold tracking-[0.12em] text-accent">482 913</p>
                  <div class="mx-auto mt-5 h-1.5 w-2/3 overflow-hidden rounded-full bg-border-soft"><div class="h-full w-3/5 rounded-full bg-accent"></div></div>
                  <p class="mt-2 text-xs text-muted">{{ t.showcase.code.renews }}</p>
                </div>
              </template>

              <!-- compartilhar -->
              <template v-else-if="row.id === 'share'">
                <div class="flex items-center gap-2.5 border-b border-border-soft pb-4">
                  <span class="aw-icon !h-9 !w-9 !rounded-lg"><Users class="h-4 w-4" /></span>
                  <p class="text-sm font-semibold">{{ t.highlights[2].kicker }} · Redes sociais</p>
                </div>
                <div class="mt-4 space-y-3">
                  <div class="flex items-center justify-between rounded-lg border border-border-soft bg-surface-2/70 px-3.5 py-3 text-sm">
                    <span class="text-muted">marina@suaempresa.com</span>
                    <span class="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">Edição</span>
                  </div>
                  <div class="rounded-lg border border-accent/30 bg-accent/5 px-3.5 py-3">
                    <p class="text-[0.65rem] uppercase tracking-widest text-muted">Código de verificação</p>
                    <p class="mt-1 font-mono text-sm font-semibold tracking-wider">K7QM · 2XPA · 9RTD · WE4B · H8NC</p>
                  </div>
                  <div class="flex items-center justify-between rounded-lg border border-border-soft px-3.5 py-3 text-sm">
                    <span class="flex items-center gap-2"><Users class="h-4 w-4 text-accent" />joao@agencia.com</span>
                    <span class="rounded-full bg-border-soft px-2.5 py-0.5 text-xs font-semibold text-muted">Leitura</span>
                  </div>
                </div>
              </template>

              <!-- celular -->
              <template v-else>
                <div class="mx-auto w-44 rounded-[2rem] border border-border-soft bg-surface-2 p-2">
                  <div class="rounded-[1.5rem] bg-bg px-4 pb-6 pt-8">
                    <span class="aw-icon !h-10 !w-10 !rounded-xl"><Smartphone class="h-5 w-5" /></span>
                    <p class="mt-4 text-base font-bold tracking-tight">LoginHUB</p>
                    <p class="mt-1 flex items-center gap-1.5 text-[0.65rem] text-muted"><Fingerprint class="h-3.5 w-3.5 text-accent" />Abrir com a digital</p>
                    <span class="aw-btn aw-btn-primary mt-6 !w-full !py-2 text-xs">Abrir</span>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
