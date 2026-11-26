<script setup lang="ts">
defineProps<{
  kicker: string
  title: string
  lead?: string
  center?: boolean
}>()
</script>

<template>
  <div :class="['max-w-3xl', center ? 'mx-auto text-center' : '']">
    <span class="aw-kicker">
      <span class="h-px w-6 bg-accent/70" aria-hidden="true"></span>
      {{ kicker }}
    </span>
    <h2 class="aw-title mt-4">{{ title }}</h2>
    <p v-if="lead" :class="['aw-lead mt-5', center ? 'mx-auto' : '']">{{ lead }}</p>
  </div>
</template>
