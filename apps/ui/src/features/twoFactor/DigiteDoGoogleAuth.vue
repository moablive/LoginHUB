<script setup lang="ts">
import GoogleAuthIcon from './GoogleAuthIcon.vue';

/** Linha curta para a tela que PEDE o código, no login. */
defineProps<{ emissor?: string }>();
</script>

<template>
  <div class="flex items-center gap-3 rounded-celula bg-fill-2 p-3">
    <GoogleAuthIcon :tamanho="32" class="rounded-lg" />
    <p class="text-subhead">
      Abra o <strong>Google Authenticator</strong> e digite o código de 6 dígitos
      <template v-if="emissor"> de <strong>{{ emissor }}</strong></template>
      <template v-else> desta conta</template>.
    </p>
  </div>
</template>
