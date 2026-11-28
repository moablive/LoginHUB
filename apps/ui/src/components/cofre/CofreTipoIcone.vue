<script setup lang="ts">
import { CreditCardIcon, IdentificationIcon, KeyIcon } from '@heroicons/vue/24/outline';
import type { TipoItem } from '@/features/cofre/tipos';

/** Ícone do item de cartão ou documento (o login usa o ícone do site, em CofreItemIcone). Mesma forma e tamanho dele. */
withDefaults(defineProps<{ tipo: TipoItem; grande?: boolean }>(), { grande: false });
</script>

<template>
  <div
    class="flex shrink-0 items-center justify-center rounded-[10px] text-white"
    :class="[grande ? 'h-12 w-12' : 'h-10 w-10', tipo === 'cartao' ? 'bg-warning' : tipo === 'documento' ? 'bg-success' : 'bg-indigo']"
    aria-hidden="true"
  >
    <CreditCardIcon v-if="tipo === 'cartao'" :class="grande ? 'h-6 w-6' : 'h-5 w-5'" />
    <IdentificationIcon v-else-if="tipo === 'documento'" :class="grande ? 'h-6 w-6' : 'h-5 w-5'" />
    <KeyIcon v-else :class="grande ? 'h-6 w-6' : 'h-5 w-5'" />
  </div>
</template>
