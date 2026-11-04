<script setup lang="ts">
import ThemeToggle from '@/components/ThemeToggle.vue';
import VersionBadge from '@/features/version/VersionBadge.vue';
import UpdateBanner from '@/features/version/UpdateBanner.vue';
import InstallBanner from '@/features/pwa/InstallBanner.vue';
</script>

<template>
  <!-- Fora do <RouterView> de propósito: trocar de rota não pode desmontar o
       aviso de versão nova nem zerar o intervalo da checagem. -->
  <ThemeToggle />
  <VersionBadge />
  <UpdateBanner />
  <InstallBanner />
  <RouterView />
</template>
