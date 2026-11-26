<script setup lang="ts">
import {
  Fingerprint,
  Layers,
  Lock,
  ShieldCheck,
  Smartphone,
  Timer,
  UserCog,
  Waypoints,
} from 'lucide-vue-next'
import { useI18n } from '@/i18n'
import SectionHeading from './SectionHeading.vue'

const { t } = useI18n()

// Ordem espelha `features.items` do dicionário.
const icons = [Lock, ShieldCheck, Fingerprint, Smartphone, Timer, Waypoints, UserCog, Layers]
</script>

<template>
  <section id="recursos" class="aw-section border-t border-border-soft bg-surface/40">
    <div class="aw-container">
      <SectionHeading
        center
        :kicker="t.features.kicker"
        :title="t.features.title"
        :lead="t.features.lead"
      />

      <div class="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <article v-for="(item, i) in t.features.items" :key="item.title" class="aw-card">
          <span class="aw-icon"><component :is="icons[i]" class="h-5 w-5" /></span>
          <h3 class="mt-5 text-base font-semibold tracking-tight">{{ item.title }}</h3>
          <p class="mt-2.5 text-sm leading-relaxed text-muted">{{ item.body }}</p>
        </article>
      </div>
    </div>
  </section>
</template>
