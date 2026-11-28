<script setup lang="ts">
import { computed, ref } from 'vue';
import { ExclamationTriangleIcon, ShieldCheckIcon } from '@heroicons/vue/24/outline';
import UiTextField from '@/components/ui/UiTextField.vue';
import type { ItemCofre } from '@/features/cofre/useCofre';
import { agruparNumero, bandeiraDe, cartaoVazio, cartaoVencido, formatarValidade, luhnOk, soDigitos, validadeCartaoOk, type DadosCartao } from '@/features/cofre/tipos';

/**
 * Formulário do cartão (28/11/2026). O número vai mascarado depois de salvo; CVV e PIN só são guardados se a pessoa
 * desligar "Não salvar CVV e PIN" (ligado por padrão). Sem `name`/`autocomplete` de cartão para o gerenciador do navegador
 * não oferecer guardar o número em outro lugar.
 */
const form = defineModel<ItemCofre>('form', { required: true });

const c = computed<DadosCartao>(() => form.value.cartao ?? cartaoVazio());
const salvarCvv = ref(!!(form.value.cartao?.cvv || form.value.cartao?.pin));

function mudar(patch: Partial<DadosCartao>) {
  form.value = { ...form.value, cartao: { ...c.value, ...patch } };
}
function aoDigitarNumero(v: string) {
  const n = soDigitos(v).slice(0, 19);
  mudar({ numero: n, bandeira: bandeiraDe(n) });
}
function alternarCvv() {
  salvarCvv.value = !salvarCvv.value;
  // Desligar apaga o que estava digitado: "não salvar" significa que não vai no item.
  if (!salvarCvv.value) {
    const { cvv: _a, pin: _b, ...resto } = c.value;
    form.value = { ...form.value, cartao: resto };
  }
}

const numeroDigitado = computed(() => c.value.numero.length > 0);
const erroNumero = computed(() => (numeroDigitado.value && c.value.numero.length >= 13 && !luhnOk(c.value.numero) ? 'Número inválido: confira os dígitos.' : null));
const erroValidade = computed(() => (c.value.validade.length === 5 && !validadeCartaoOk(c.value.validade) ? 'Use MM/AA, com mês de 01 a 12.' : null));
const vencido = computed(() => cartaoVencido(c.value.validade));
const dicaNumero = computed(() => (luhnOk(c.value.numero) ? `Número válido${c.value.bandeira ? ` · ${c.value.bandeira}` : ''}` : 'Só dígitos. Fica mascarado depois de salvar.'));
</script>

<template>
  <div class="space-y-3">
    <UiTextField
      :model-value="agruparNumero(c.numero)"
      rotulo="Número do cartão"
      inputmode="numeric"
      autocomplete="off"
      spellcheck="false"
      placeholder="0000 0000 0000 0000"
      maxlength="24"
      :dica="dicaNumero"
      :erro="erroNumero"
      @update:model-value="aoDigitarNumero"
    />
    <UiTextField :model-value="c.titular" rotulo="Nome impresso no cartão" autocomplete="off" autocapitalize="characters" @update:model-value="(v: string) => mudar({ titular: v.toUpperCase() })" />
    <div class="grid grid-cols-2 gap-3">
      <UiTextField :model-value="c.validade" rotulo="Validade" inputmode="numeric" autocomplete="off" placeholder="MM/AA" maxlength="5" :erro="erroValidade" :dica="vencido ? 'Este cartão já venceu.' : undefined" @update:model-value="(v: string) => mudar({ validade: formatarValidade(v) })" />
      <UiTextField :model-value="c.banco" rotulo="Banco (opcional)" autocomplete="off" @update:model-value="(v: string) => mudar({ banco: v })" />
    </div>

    <div class="flex items-center gap-3 rounded-celula bg-fill-2 p-3">
      <div class="min-w-0 flex-1">
        <p class="text-body font-semibold">Não salvar CVV e PIN</p>
        <p class="text-footnote text-label-2">Recomendado. Você digita o CVV na hora da compra.</p>
      </div>
      <button
        type="button"
        role="switch"
        :aria-checked="!salvarCvv"
        aria-label="Não salvar CVV e PIN"
        class="relative h-7 w-12 shrink-0 rounded-full transition-colors"
        :class="!salvarCvv ? 'bg-success' : 'bg-separator'"
        @click="alternarCvv"
      >
        <span class="absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform" :class="!salvarCvv ? 'translate-x-5' : ''" />
      </button>
    </div>
    <div v-if="salvarCvv" class="space-y-3 rounded-celula border border-dashed border-warning p-3">
      <p class="flex items-start gap-2 text-footnote text-label-2">
        <ExclamationTriangleIcon class="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        CVV e PIN ficam cifrados neste aparelho e só saem cifrados. Quem tiver sua palavra-passe, ou acesso a este cofre se ele for compartilhado, poderá vê-los.
      </p>
      <div class="grid grid-cols-2 gap-3">
        <UiTextField :model-value="c.cvv ?? ''" rotulo="CVV" type="password" inputmode="numeric" autocomplete="off" maxlength="4" @update:model-value="(v: string) => mudar({ cvv: soDigitos(v) })" />
        <UiTextField :model-value="c.pin ?? ''" rotulo="PIN (opcional)" type="password" inputmode="numeric" autocomplete="off" maxlength="8" @update:model-value="(v: string) => mudar({ pin: soDigitos(v) })" />
      </div>
    </div>
    <label class="block text-footnote text-label-2">
      Notas
      <textarea :value="form.notas" rows="3" class="mt-1 w-full rounded-lg bg-fill-2 p-3 text-body text-label outline-none focus:ring-2 focus:ring-accent/40" @input="form = { ...form, notas: ($event.target as HTMLTextAreaElement).value }" />
    </label>
    <p class="flex items-start gap-2 text-footnote text-label-2"><ShieldCheckIcon class="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />Cifrado antes de sair do navegador. O servidor nunca vê o número.</p>
  </div>
</template>
