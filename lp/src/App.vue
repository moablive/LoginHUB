<script setup lang="ts">
import NavBar from './components/NavBar.vue'
import PaymentBanner from './components/PaymentBanner.vue'
import Hero from './components/Hero.vue'
import Problem from './components/Problem.vue'
import Trust from './components/Trust.vue'
import HighlightRows from './components/HighlightRows.vue'
import Faq from './components/Faq.vue'
import Features from './components/Features.vue'
import Showcase from './components/Showcase.vue'
import HowItWorks from './components/HowItWorks.vue'
import Security from './components/Security.vue'
import Pricing from './components/Pricing.vue'
import FinalCta from './components/FinalCta.vue'
import Footer from './components/Footer.vue'
import { useSeo } from './composables/useSeo'

useSeo()
</script>

<template>
  <NavBar />
  <PaymentBanner />
  <main>
    <Hero />
    <Trust />
    <Problem />
    <HighlightRows />
    <Features />
    <Showcase />
    <HowItWorks />
    <Security />
    <Pricing />
    <Faq />
    <FinalCta />
  </main>
  <Footer />
</template>
