<script setup lang="ts">
// Moldura das telas do super admin: largura de leitura e respiro de 8 em 8.
// A barra de navegação mora em cada página (UiNavBar), porque o título e as
// ações mudam com ela.
</script>

<template>
  <div class="min-h-screen min-h-dvh bg-canvas text-label">
    <main class="mx-auto w-full max-w-[1200px] px-4 pb-28 sm:px-6 lg:px-8">
      <RouterView />
    </main>
  </div>
</template>
