<script setup lang="ts">
/**
 * Campo do código de 6 dígitos (ou do código de recuperação). Grande, centrado
 * e espaçado, como o do iOS ao pedir código por SMS.
 *
 * Sem autofocus no celular: abrir o teclado durante a montagem rola a tela
 * sozinha e, no iOS, o foco às vezes fica sem teclado nenhum. No desktop o
 * foco automático segue valendo.
 */
const props = defineProps<{ backup?: boolean; rotulo: string }>();
const modelo = defineModel<string>({ default: '' });

const focar = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;

function aoDigitar(e: Event) {
  const v = (e.target as HTMLInputElement).value;
  // Só dígitos: colar "123 456" do autenticador não pode travar o botão em
  // `length !== 6`. O de recuperação tem letras e hífen.
  modelo.value = props.backup ? v.toUpperCase() : v.replace(/\D/g, '').slice(0, 6);
  (e.target as HTMLInputElement).value = modelo.value;
}
</script>

<template>
  <input
    :value="modelo"
    :aria-label="rotulo"
    type="text"
    :inputmode="backup ? 'text' : 'numeric'"
    :pattern="backup ? undefined : '[0-9]*'"
    autocomplete="one-time-code"
    :autocapitalize="backup ? 'characters' : 'off'"
    autocorrect="off"
    spellcheck="false"
    :placeholder="backup ? 'XXXXX-XXXXX' : '000000'"
    :maxlength="backup ? 11 : 6"
    :autofocus="focar"
    required
    class="block min-h-[56px] w-full rounded-controle border-0 bg-fill-2 px-4 text-center font-mono text-title-2 tracking-[0.35em] text-label outline-none placeholder:text-label-3 focus:bg-surface focus:ring-2 focus:ring-accent"
    @input="aoDigitar"
  />
</template>
