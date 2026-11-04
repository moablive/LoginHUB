<script setup lang="ts">
import type { Component } from 'vue';
import { ShieldCheckIcon } from '@heroicons/vue/24/outline';

/**
 * Moldura das telas públicas (login, convite, enrolamento de 2FA): cartão
 * único centralizado, ícone, título e texto de apoio. O conteúdo da etapa vem
 * no slot.
 */
withDefaults(
  defineProps<{
    titulo: string;
    texto?: string;
    icone?: Component;
    tom?: 'accent' | 'success' | 'danger';
  }>(),
  { icone: () => ShieldCheckIcon, tom: 'accent' },
);

const TONS = {
  accent: 'bg-accent/15 text-accent',
  success: 'bg-success/15 text-success',
  danger: 'bg-danger/15 text-danger',
};
</script>

<template>
  <div class="flex min-h-screen min-h-dvh items-center justify-center bg-canvas px-4 pb-24 pt-[max(2rem,env(safe-area-inset-top))]">
    <div class="w-full max-w-[420px]">
      <div class="rounded-[20px] bg-surface px-6 py-8 shadow-[0_1px_3px_rgb(0_0_0/0.06)] sm:px-8">
        <div class="mb-6 text-center">
          <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[18px]" :class="TONS[tom]">
            <component :is="icone" class="h-9 w-9" />
          </div>
          <h1 class="text-title-2 font-bold">{{ titulo }}</h1>
          <p v-if="texto || $slots.texto" class="mt-2 text-subhead text-label-2">
            <slot name="texto">{{ texto }}</slot>
          </p>
        </div>
        <slot />
      </div>
      <p v-if="$slots.rodape" class="mt-4 text-center text-footnote text-label-2"><slot name="rodape" /></p>
    </div>
  </div>
</template>
