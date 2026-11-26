<script setup lang="ts">
import { EyeOff, MonitorSmartphone, ShieldCheck, UserCog } from 'lucide-vue-next'
import { useI18n } from '@/i18n'
import SectionHeading from './SectionHeading.vue'

const { t } = useI18n()

const icons = [EyeOff, ShieldCheck, UserCog, MonitorSmartphone]
</script>

<template>
  <section id="seguranca" class="aw-section">
    <div class="aw-container">
      <SectionHeading
        center
        :kicker="t.security.kicker"
        :title="t.security.title"
        :lead="t.security.lead"
      />

      <div class="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <article
          v-for="(item, i) in t.security.items"
          :key="item.title"
          class="aw-card border-accent/15"
        >
          <span class="aw-icon"><component :is="icons[i]" class="h-5 w-5" /></span>
          <h3 class="mt-5 text-base font-semibold tracking-tight">{{ item.title }}</h3>
          <p class="mt-2.5 text-sm leading-relaxed text-muted">{{ item.body }}</p>
        </article>
      </div>
    </div>
  </section>
</template>
