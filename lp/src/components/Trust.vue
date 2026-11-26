<script setup lang="ts">
import { useI18n } from '@/i18n'

const { t } = useI18n()
</script>

<template>
  <!-- Faixa de confiança logo abaixo do hero (como a home do 1Password): são os sistemas reais
       que já entram pelo LoginHUB, não logos de cliente inventados. -->
  <section class="border-y border-border-soft bg-surface/40 py-8">
    <div class="aw-container text-center">
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{{ t.trust.title }}</p>
      <ul class="mt-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
        <li v-for="app in t.trust.apps" :key="app" class="text-sm font-semibold tracking-tight text-muted">{{ app }}</li>
      </ul>
    </div>
  </section>
</template>
