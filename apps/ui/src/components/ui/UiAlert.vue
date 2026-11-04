<script setup lang="ts">
import { computed, toRef, useId, type Component } from 'vue';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';
import { useTravaRolagem } from '@/composables/useTravaRolagem';
import { useCamadaEsc } from '@/composables/useCamadaEsc';
import UiSpinner from './UiSpinner.vue';

/**
 * Alerta do iOS: cartão estreito no centro, título em headline, mensagem em
 * footnote e os botões colados embaixo, divididos por linha fina.
 *
 * Substitui as seis modais antigas (Alert, Confirm, Delete, Logout, Status e
 * Success): todas eram a mesma pergunta com cor diferente.
 *
 *   - `cancelar = null` → um botão só (aviso, erro, sucesso).
 *   - `tom = 'danger'`  → o botão de confirmar sai em vermelho (ação destrutiva).
 *   - `destaque`        → o nome do item afetado, em caixa, para não haver dúvida.
 *
 * A mensagem pode vir pela prop ou pelo slot padrão (quando tem negrito).
 */
const props = withDefaults(
  defineProps<{
    aberto: boolean;
    titulo: string;
    mensagem?: string;
    tom?: 'danger' | 'warning' | 'info' | 'success';
    icone?: Component;
    destaque?: string;
    confirmar?: string;
    cancelar?: string | null;
    carregando?: boolean;
    textoCarregando?: string;
  }>(),
  { tom: 'info', confirmar: 'OK', cancelar: 'Cancelar', textoCarregando: 'Aguarde…' },
);

const emit = defineEmits<{ confirmar: []; fechar: [] }>();

const id = useId();

const TONS = {
  danger: { icone: ExclamationTriangleIcon, cor: 'text-danger', fundo: 'bg-danger/15' },
  warning: { icone: ExclamationTriangleIcon, cor: 'text-warning', fundo: 'bg-warning/15' },
  info: { icone: InformationCircleIcon, cor: 'text-accent', fundo: 'bg-accent/15' },
  success: { icone: CheckCircleIcon, cor: 'text-success', fundo: 'bg-success/15' },
} as const;

const estilo = computed(() => TONS[props.tom]);
const iconeFinal = computed<Component>(() => props.icone ?? (props.tom === 'danger' && props.cancelar === null ? XCircleIcon : estilo.value.icone));
const umBotao = computed(() => props.cancelar === null);

useTravaRolagem(toRef(props, 'aberto'));

function fechar() {
  if (!props.carregando) emit('fechar');
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
        class="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/40 p-6"
        @click.self="fechar"
      >
        <div
          role="alertdialog"
          aria-modal="true"
          :aria-labelledby="`${id}-titulo`"
          :aria-describedby="`${id}-msg`"
          class="w-full max-w-[320px] animate-fade-in-up overflow-hidden rounded-[14px] bg-surface text-center text-label shadow-folha"
        >
          <div class="px-5 pb-5 pt-6">
            <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" :class="estilo.fundo">
              <component :is="iconeFinal" class="h-7 w-7" :class="estilo.cor" />
            </div>
            <h2 :id="`${id}-titulo`" class="text-headline font-semibold">{{ titulo }}</h2>
            <div :id="`${id}-msg`" class="mt-1.5 text-footnote text-label-2">
              <slot>{{ mensagem }}</slot>
            </div>
            <p
              v-if="destaque"
              class="mt-3 inline-block max-w-full break-words rounded-lg bg-fill-2 px-3 py-1.5 text-subhead font-semibold text-label"
            >
              {{ destaque }}
            </p>
          </div>

          <div class="grid border-t" :class="umBotao ? 'grid-cols-1' : 'grid-cols-2 divide-x'">
            <button
              v-if="!umBotao"
              type="button"
              class="min-h-toque px-3 py-3 text-body text-accent hover:bg-fill-2 disabled:opacity-40"
              :disabled="carregando"
              @click="fechar"
            >
              {{ cancelar }}
            </button>
            <button
              type="button"
              class="flex min-h-toque items-center justify-center gap-2 px-3 py-3 text-body font-semibold hover:bg-fill-2 disabled:opacity-60"
              :class="tom === 'danger' && !umBotao ? 'text-danger' : 'text-accent'"
              :disabled="carregando"
              @click="umBotao ? emit('fechar') : emit('confirmar')"
            >
              <UiSpinner v-if="carregando" class="h-4 w-4" />
              {{ carregando ? textoCarregando : confirmar }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
