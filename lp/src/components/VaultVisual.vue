<script setup lang="ts">
import { FileLock2, KeyRound, Lock, ShieldCheck } from 'lucide-vue-next'
import { useI18n } from '@/i18n'

const { t } = useI18n()

// Ícone por linha do cofre — a última entrada é sempre um documento.
const icons = [KeyRound, KeyRound, KeyRound, FileLock2]
</script>

<template>
  <!-- Ilustração abstrata: cofre + onda. Tudo SVG/CSS, nenhuma imagem para
       baixar — é o maior elemento acima da dobra e não pode custar LCP. -->
  <div class="relative aw-float" aria-hidden="true">
    <div class="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-accent/25 to-accent-2/10 blur-2xl"></div>

    <div class="relative rounded-xl2 border border-border-soft bg-surface/90 p-5 shadow-2xl backdrop-blur">
      <div class="flex items-center justify-between border-b border-border-soft pb-4">
        <div class="flex items-center gap-2.5">
          <span class="aw-icon !h-9 !w-9 !rounded-lg"><Lock class="h-4 w-4" /></span>
          <div>
            <p class="text-sm font-semibold">{{ t.hero.vault.label }}</p>
            <p class="text-[0.7rem] uppercase tracking-widest text-muted">{{ t.hero.vault.status }}</p>
          </div>
        </div>
        <div class="flex gap-1.5">
          <span class="h-2 w-2 rounded-full bg-accent/70"></span>
          <span class="h-2 w-2 rounded-full bg-accent-2/60"></span>
          <span class="h-2 w-2 rounded-full bg-muted/40"></span>
        </div>
      </div>

      <ul class="mt-4 space-y-2.5">
        <li
          v-for="(entry, i) in t.hero.vault.entries"
          :key="entry"
          class="flex items-center justify-between rounded-lg border border-border-soft bg-surface-2/70 px-3.5 py-3"
        >
          <span class="flex items-center gap-2.5 text-sm font-medium">
            <component :is="icons[i]" class="h-4 w-4 text-accent" />
            {{ entry }}
          </span>
          <span class="font-mono text-xs tracking-[0.2em] text-muted">••••••••</span>
        </li>
      </ul>

      <!-- Onda: a marca da Astrał wave. Fica porque é identidade, não porque
           o público é de música — a consultoria atende qualquer operação. -->
      <div class="mt-5 flex items-center gap-3 rounded-lg bg-gradient-to-r from-accent/12 to-transparent px-3.5 py-3">
        <ShieldCheck class="h-4 w-4 shrink-0 text-accent" />
        <svg viewBox="0 0 240 24" class="h-6 w-full text-accent/70" fill="none">
          <path
            d="M0 12 Q 15 2 30 12 T 60 12 T 90 12 T 120 12 T 150 12 T 180 12 T 210 12 T 240 12"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </div>
    </div>
  </div>
</template>
