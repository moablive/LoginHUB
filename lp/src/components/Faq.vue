<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
import { useI18n } from '@/i18n'
import SectionHeading from './SectionHeading.vue'

const { t } = useI18n()
</script>

<template>
  <section id="faq" class="aw-section border-t border-border-soft">
    <div class="aw-container">
      <SectionHeading center :kicker="t.faq.kicker" :title="t.faq.title" />
      <div class="mx-auto mt-12 max-w-3xl divide-y divide-border-soft rounded-xl2 border border-border-soft bg-surface/60">
        <details v-for="item in t.faq.items" :key="item.q" class="group px-5 py-4">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold tracking-tight">
            {{ item.q }}
            <ChevronDown class="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <p class="mt-3 text-sm leading-relaxed text-muted">{{ item.a }}</p>
        </details>
      </div>
    </div>
  </section>
</template>
