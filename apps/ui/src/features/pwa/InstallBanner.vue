<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue';
import { useInstalarPwa } from './useInstalarPwa';

// Oferta de instalação do PWA, no mesmo formato do artist.astralwavelabel.com.
// No Chrome do Android e do desktop é um clique; no iPhone e no iPad — Chrome
// inclusive — vira passo a passo, porque o WebKit não deixa a página abrir o
// diálogo de instalação. O porquê está em useInstalarPwa.
const { podeInstalar, modo, passos, rotulo, instalando, instalar, dispensar } = useInstalarPwa();
</script>

<template>
  <Transition
    enter-active-class="transition duration-250 ease-out"
    enter-from-class="-translate-y-3 opacity-0"
    leave-active-class="transition duration-200 ease-in"
    leave-to-class="-translate-y-3 opacity-0"
  >
    <!-- Um degrau abaixo do aviso de versão: se os dois aparecerem, atualizar
         vem na frente de instalar. -->
    <div
      v-if="podeInstalar"
      class="material fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[54] rounded-[14px] p-4 text-label shadow-folha ring-1 ring-separator sm:left-auto sm:right-5 sm:w-[360px]"
      role="region"
      aria-label="Instalar aplicativo"
    >
      <div class="flex items-start gap-3">
        <img src="/pwa-192x192.png" alt="" class="h-12 w-12 shrink-0 rounded-[11px] shadow-sm ring-1 ring-separator" />
        <div class="min-w-0">
          <p class="text-headline font-semibold">Instalar o LoginHub</p>
          <p class="mt-0.5 text-footnote text-label-2">
            {{
              modo === 'prompt'
                ? 'Abre em janela própria, com ícone na tela de início e sem a barra do navegador.'
                : `No iPhone e no iPad a instalação é pelo menu do ${rotulo}:`
            }}
          </p>
          <ol v-if="modo === 'ios'" class="mt-2 list-decimal space-y-0.5 pl-5 text-footnote text-label">
            <li v-for="(passo, i) in passos" :key="i">{{ passo }}</li>
          </ol>
        </div>
      </div>

      <div class="mt-3 flex justify-end gap-2">
        <UiButton variante="plain" tamanho="small" :disabled="instalando" @click="dispensar">
          {{ modo === 'ios' ? 'Entendi' : 'Agora não' }}
        </UiButton>
        <UiButton v-if="modo === 'prompt'" tamanho="small" :carregando="instalando" @click="instalar">
          {{ instalando ? 'Instalando…' : 'Instalar' }}
        </UiButton>
      </div>
    </div>
  </Transition>
</template>
