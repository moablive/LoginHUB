<script setup lang="ts">
import GoogleAuthIcon from './GoogleAuthIcon.vue';
import { GOOGLE_AUTH_APPSTORE, GOOGLE_AUTH_PLAY } from './googleAuth';

/** Faixa de cadastro: ícone, passos e onde baixar. Vai logo acima do QR. */
defineProps<{ emissor?: string }>();
</script>

<template>
  <div class="rounded-celula bg-accent/10 p-4">
    <div class="flex items-center gap-3">
      <GoogleAuthIcon class="rounded-[11px] ring-1 ring-separator" />
      <div>
        <p class="text-caption-1 font-semibold uppercase tracking-wide text-accent">Escaneie com</p>
        <p class="text-headline font-semibold">Google Authenticator</p>
      </div>
    </div>

    <ol class="mt-3 space-y-1 text-subhead">
      <li><span class="font-semibold text-accent">1.</span> Abra o Google Authenticator no celular.</li>
      <li><span class="font-semibold text-accent">2.</span> Toque em <strong>+</strong> e depois em <strong>Ler código QR</strong>.</li>
      <li>
        <span class="font-semibold text-accent">3.</span> Digite abaixo os 6 dígitos que aparecem em
        <strong>{{ emissor || 'nome do aplicativo' }}</strong>.
      </li>
    </ol>

    <p class="mt-3 text-footnote text-label-2">
      Ainda não tem?
      <a :href="GOOGLE_AUTH_PLAY" target="_blank" rel="noreferrer" class="font-medium text-accent hover:underline">Android</a>
      ·
      <a :href="GOOGLE_AUTH_APPSTORE" target="_blank" rel="noreferrer" class="font-medium text-accent hover:underline">iPhone</a>
    </p>
  </div>
</template>
