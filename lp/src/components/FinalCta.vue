<script setup lang="ts">
import { ArrowRight, Mail } from 'lucide-vue-next'
import { useI18n } from '@/i18n'
import { CONTACT_URL } from '@/links'
import { useCheckout } from '@/composables/useCheckout'

const { t } = useI18n()
const { irParaFormulario } = useCheckout()
</script>

<template>
  <section class="aw-section">
    <div class="aw-container">
      <div class="relative overflow-hidden rounded-xl2 border border-accent/25 bg-surface px-6 py-16 text-center md:px-16">
        <div class="absolute inset-0 aw-glow" aria-hidden="true"></div>

        <div class="relative">
          <h2 class="aw-title">{{ t.finalCta.title }}</h2>
          <p class="aw-lead mx-auto mt-5">{{ t.finalCta.body }}</p>

          <div class="mt-10 flex flex-wrap justify-center gap-3">
            <button class="aw-btn aw-btn-primary" @click="irParaFormulario">
              {{ t.finalCta.buy }}
              <ArrowRight class="h-4 w-4" />
            </button>
            <a :href="CONTACT_URL" class="aw-btn aw-btn-ghost">
              <Mail class="h-4 w-4" />
              {{ t.finalCta.contact }}
            </a>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
