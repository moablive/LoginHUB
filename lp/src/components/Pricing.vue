<script setup lang="ts">
import { Check } from 'lucide-vue-next'
import { useI18n } from '@/i18n'
import SectionHeading from './SectionHeading.vue'
import CheckoutForm from './CheckoutForm.vue'

const { t } = useI18n()
</script>

<template>
  <section id="preco" class="aw-section border-t border-border-soft bg-surface/40">
    <div class="aw-container">
      <SectionHeading
        center
        :kicker="t.pricing.kicker"
        :title="t.pricing.title"
        :lead="t.pricing.lead"
      />

      <!-- O que se leva à esquerda, os dados à direita. O formulário fica à
           vista porque é obrigatório para pagar: escondê-lo atrás de um botão
           só faz a pessoa procurar onde digitar. -->
      <div class="mx-auto mt-14 grid max-w-5xl items-start gap-6 lg:grid-cols-2">
        <article v-for="plan in t.pricing.plans" :key="plan.name" class="aw-card">
          <div class="flex items-start justify-between gap-3">
            <h3 class="text-lg font-semibold tracking-tight">{{ plan.name }}</h3>
            <span
              v-if="plan.badge"
              class="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[0.7rem] font-semibold text-accent"
            >{{ plan.badge }}</span>
          </div>

          <p class="mt-5 flex flex-wrap items-baseline gap-x-2">
            <span class="text-4xl font-extrabold tracking-tight">{{ plan.price }}</span>
            <span class="text-sm text-muted">{{ plan.period }}</span>
          </p>

          <ul class="mt-7 space-y-3">
            <li v-for="feature in plan.features" :key="feature" class="flex gap-2.5 text-sm">
              <Check class="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span class="text-muted">{{ feature }}</span>
            </li>
          </ul>

          <!-- O que NÃO está no preço. Dentro do card, colado na lista do que
               está: é aqui que a expectativa se forma. -->
          <p class="mt-7 border-t border-border-soft pt-5 text-xs leading-relaxed text-muted">
            {{ t.pricing.note }}
          </p>
        </article>

        <CheckoutForm />
      </div>
    </div>
  </section>
</template>
