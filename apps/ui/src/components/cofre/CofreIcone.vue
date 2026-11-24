<script setup lang="ts">
import { computed } from 'vue';
import { estiloDoCofre, iconeDoCofre, imagemDoCofreValida } from '@/features/cofre/aparencia';

/**
 * O círculo do cofre: a imagem que o dono escolheu (24/11/2026) ou, sem ela, o
 * ícone na cor do cofre. A imagem é uma miniatura guardada cifrada dentro do
 * próprio cofre; só entra no `src` se for mesmo um data: de imagem.
 */
const props = withDefaults(defineProps<{ icone?: string; cor?: string; imagem?: string; grande?: boolean }>(), { grande: false });
const foto = computed(() => (imagemDoCofreValida(props.imagem) ? props.imagem : null));
</script>

<template>
  <img v-if="foto" :src="foto" alt="" aria-hidden="true" class="shrink-0 rounded-full object-cover" :class="grande ? 'h-12 w-12' : 'h-10 w-10'" />
  <span v-else class="flex shrink-0 items-center justify-center rounded-full" :class="grande ? 'h-12 w-12' : 'h-10 w-10'" :style="estiloDoCofre(cor)" aria-hidden="true">
    <component :is="iconeDoCofre(icone)" :class="grande ? 'h-6 w-6' : 'h-5 w-5'" />
  </span>
</template>
