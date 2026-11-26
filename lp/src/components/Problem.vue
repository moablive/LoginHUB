<script setup lang="ts">
import { KeySquare, ListChecks, ShieldAlert } from 'lucide-vue-next'
import { useI18n } from '@/i18n'
import SectionHeading from './SectionHeading.vue'

const { t } = useI18n()

const icons = [ListChecks, KeySquare, ShieldAlert]
</script>

<template>
  <section id="problema" class="aw-section border-t border-border-soft bg-surface/40">
    <div class="aw-container">
      <SectionHeading :kicker="t.problem.kicker" :title="t.problem.title" :lead="t.problem.lead" />

      <div class="mt-14 grid gap-6 md:grid-cols-3">
        <article v-for="(card, i) in t.problem.cards" :key="card.title" class="aw-card">
          <span class="aw-icon"><component :is="icons[i]" class="h-5 w-5" /></span>
          <h3 class="mt-5 text-lg font-semibold tracking-tight">{{ card.title }}</h3>
          <p class="mt-3 text-sm leading-relaxed text-muted">{{ card.body }}</p>
        </article>
      </div>
    </div>
  </section>
</template>
