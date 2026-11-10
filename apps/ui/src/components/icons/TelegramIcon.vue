<script setup lang="ts">
/**
 * Logo do Telegram (o aviãozinho no círculo). O heroicons não tem marca, e o
 * `PaperAirplaneIcon` dele lê como "enviar" — aqui o ícone precisa dizer
 * "Telegram". A cor vem do `currentColor`, então quem usa decide se está
 * aceso (azul da marca) ou apagado (cinza).
 */
</script>

<template>
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path
      d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.64 6.8-1.5 7.07c-.11.5-.41.62-.83.39l-2.29-1.69-1.1 1.06c-.12.12-.23.23-.46.23l.16-2.33 4.24-3.83c.18-.16-.04-.25-.29-.09l-5.24 3.3-2.26-.71c-.49-.15-.5-.49.1-.72l8.83-3.4c.41-.15.77.1.64.72Z"
    />
  </svg>
</template>
