<script setup lang="ts">
import { toRef, useId } from 'vue';
import { XMarkIcon } from '@heroicons/vue/24/outline';
import { useTravaRolagem } from '@/composables/useTravaRolagem';
import { useCamadaEsc } from '@/composables/useCamadaEsc';

/**
 * Folha (sheet) do iOS: sobe de baixo no celular e vira cartão centralizado a
 * partir de 640px. É a moldura de todo formulário em modal do painel.
 *
 * O conteúdo rola por dentro e o rodapé de ações fica preso embaixo, fora da
 * barra de gestos — com o teclado aberto o botão de salvar continua à mão.
 *
 * `bloqueado` (salvando) impede fechar por fora, pelo ESC e pelo X: fechar no
 * meio do envio deixava a pessoa sem saber se gravou.
 */
const props = withDefaults(
  defineProps<{
    aberto: boolean;
    titulo: string;
    subtitulo?: string;
    largura?: 'sm' | 'md' | 'lg' | 'xl';
    bloqueado?: boolean;
  }>(),
  { largura: 'md' },
);

const emit = defineEmits<{ fechar: [] }>();

const id = useId();
const LARGURAS = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };

useTravaRolagem(toRef(props, 'aberto'));

function fechar() {
  if (!props.bloqueado) emit('fechar');
}

useCamadaEsc(toRef(props, 'aberto'), fechar);
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="aberto"
        class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
        @click.self="fechar"
      >
        <section
          role="dialog"
          aria-modal="true"
          :aria-labelledby="`${id}-titulo`"
          class="flex max-h-[92dvh] w-full animate-fade-in-up flex-col overflow-hidden rounded-t-folha bg-surface text-label shadow-folha sm:max-h-[88dvh] sm:rounded-folha"
          :class="LARGURAS[largura]"
        >
          <!-- alça: só no celular, sinaliza que é folha -->
          <div class="flex justify-center pt-2 sm:hidden" aria-hidden="true">
            <span class="h-1.5 w-9 rounded-full bg-label-3" />
          </div>

          <header class="flex items-start gap-3 px-5 pb-3 pt-3 sm:pt-5">
            <div class="min-w-0 flex-1">
              <h2 :id="`${id}-titulo`" class="text-title-3 font-semibold">{{ titulo }}</h2>
              <p v-if="subtitulo" class="mt-0.5 text-subhead text-label-2">{{ subtitulo }}</p>
            </div>
            <slot name="cabecalho" />
            <button
              type="button"
              class="-mr-2 -mt-1 flex h-toque w-toque shrink-0 items-center justify-center rounded-full text-label-2 hover:bg-fill-2 hover:text-label disabled:opacity-40"
              aria-label="Fechar"
              :disabled="bloqueado"
              @click="fechar"
            >
              <span class="flex h-8 w-8 items-center justify-center rounded-full bg-fill-2">
                <XMarkIcon class="h-5 w-5" />
              </span>
            </button>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
            <slot />
          </div>

          <footer
            v-if="$slots.acoes"
            class="pb-seguro flex flex-col-reverse gap-2 border-t px-5 pt-3 sm:flex-row sm:justify-end sm:pb-4"
          >
            <slot name="acoes" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
