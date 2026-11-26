<script setup lang="ts">
import { CreditCard, ShieldCheck, Smartphone } from 'lucide-vue-next'
import { useI18n } from '@/i18n'
import SectionHeading from './SectionHeading.vue'

const { t } = useI18n()

const icons = [CreditCard, ShieldCheck, Smartphone]
</script>

<template>
  <section id="como-funciona" class="aw-section border-t border-border-soft bg-surface/40">
    <div class="aw-container">
      <SectionHeading center :kicker="t.how.kicker" :title="t.how.title" />

      <ol class="relative mt-14 grid gap-6 md:grid-cols-3">
        <!-- Trilho que liga os três passos; some no mobile, onde eles empilham. -->
        <div
          class="absolute inset-x-[16%] top-11 hidden h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent md:block"
          aria-hidden="true"
        ></div>

        <li v-for="(step, i) in t.how.steps" :key="step.title" class="aw-card relative text-center">
          <span class="aw-icon mx-auto !h-12 !w-12 bg-bg">
            <component :is="icons[i]" class="h-5 w-5" />
          </span>
          <span class="mt-4 block text-xs font-bold tracking-[0.3em] text-accent">
            {{ String(i + 1).padStart(2, '0') }}
          </span>
          <h3 class="mt-2 text-lg font-semibold tracking-tight">{{ step.title }}</h3>
          <p class="mt-3 text-sm leading-relaxed text-muted">{{ step.body }}</p>
        </li>
      </ol>
    </div>
  </section>
</template>
