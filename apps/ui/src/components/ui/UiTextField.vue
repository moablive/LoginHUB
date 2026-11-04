<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { EyeIcon, EyeSlashIcon } from '@heroicons/vue/24/outline';

/**
 * Campo de texto no padrão do iOS: rótulo acima (footnote), caixa no fundo de
 * controle, dica ou erro embaixo. 17px no campo de propósito: abaixo de 16px o
 * Safari do iPhone dá zoom na página ao focar.
 *
 * Atributos que não são props (`autocomplete`, `inputmode`, `maxlength`,
 * `required`…) vão direto para o <input>.
 */
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    rotulo?: string;
    type?: string;
    placeholder?: string;
    dica?: string;
    erro?: string | null;
    /** Campo de senha ganha o botão de mostrar/ocultar. */
    revelar?: boolean;
    /** Esconde o rótulo visualmente (continua para leitor de tela). */
    rotuloOculto?: boolean;
    disabled?: boolean;
  }>(),
  { type: 'text' },
);

const modelo = defineModel<string>({ default: '' });

const id = useId();
const visivel = ref(false);
const tipo = computed(() => (props.revelar && visivel.value ? 'text' : props.type));
</script>

<template>
  <div class="w-full">
    <label
      v-if="rotulo"
      :for="id"
      :class="rotuloOculto ? 'sr-only' : 'mb-1.5 block px-1 text-footnote font-medium text-label-2'"
    >
      {{ rotulo }}
    </label>

    <div class="relative">
      <span
        v-if="$slots.icone"
        class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-label-2 [&>svg]:h-5 [&>svg]:w-5"
        aria-hidden="true"
      >
        <slot name="icone" />
      </span>

      <input
        :id="id"
        v-model="modelo"
        v-bind="$attrs"
        :type="tipo"
        :placeholder="placeholder"
        :disabled="disabled"
        :aria-invalid="erro ? true : undefined"
        :aria-describedby="erro || dica ? `${id}-nota` : undefined"
        class="block min-h-toque w-full rounded-controle border-0 bg-fill-2 px-4 py-2.5 text-body text-label outline-none ring-1 ring-inset ring-transparent transition placeholder:text-label-3 focus:bg-surface focus:ring-2 focus:ring-accent disabled:opacity-50"
        :class="[
          $slots.icone ? 'pl-10' : '',
          revelar ? 'pr-12' : '',
          erro ? 'ring-danger/70 focus:ring-danger' : '',
        ]"
      />

      <button
        v-if="revelar"
        type="button"
        class="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-controle text-label-2 hover:text-label"
        :aria-label="visivel ? 'Ocultar' : 'Mostrar'"
        :aria-pressed="visivel"
        @click="visivel = !visivel"
      >
        <EyeSlashIcon v-if="visivel" class="h-5 w-5" />
        <EyeIcon v-else class="h-5 w-5" />
      </button>
    </div>

    <p
      v-if="erro || dica"
      :id="`${id}-nota`"
      class="mt-1.5 px-1 text-footnote"
      :class="erro ? 'text-danger' : 'text-label-2'"
    >
      {{ erro || dica }}
    </p>
  </div>
</template>
