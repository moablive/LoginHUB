<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ClipboardDocumentIcon } from '@heroicons/vue/24/outline';
import { cofreApi, type ContaDoAppNoCofre } from '@loginhub/api-client';
import { codigoTotp, lerTotp, segundosRestantes } from '@/features/cofre/cripto';

/**
 * A conta do app da pessoa no "Meu cofre" (24/11/2026, db/021, pedido do dono da Sul
 * Alimentos: "logar CPF + CPF e já ter o 2FA da conta cadastrado com o ícone da Sul, sem
 * precisar pôr a palavra-passe"). O hub monta o item na hora, para a própria conta da
 * sessão: logo do app, CPF e o código 2FA ao vivo. Nada é guardado no cofre — depois de
 * um "Resetar 2FA" o código já sai do autenticador novo. Só aparece em app com
 * `aparelho_confiavel`; nos outros a rota devolve `null` e o cartão some.
 */
const conta = ref<ContaDoAppNoCofre | null>(null);
const agora = ref(Date.now());
const copiado = ref<string | null>(null);
const erro = ref<string | null>(null);
let relogio: ReturnType<typeof setInterval> | undefined;
let limparCopia: ReturnType<typeof setTimeout> | undefined;

const totp = computed(() => (conta.value ? lerTotp(conta.value.totp) : null));
const codigo = computed(() => (totp.value ? codigoTotp(totp.value, agora.value) : null));
const resta = computed(() => (totp.value ? segundosRestantes(totp.value, agora.value) : 0));
/** Logo do app só como data: de imagem (é o que o painel do hub grava); outra coisa vira as iniciais. */
const logo = computed(() => (conta.value?.logo && /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(conta.value.logo) ? conta.value.logo : null));

onMounted(async () => {
  try {
    conta.value = await cofreApi.contaDoApp();
  } catch {
    conta.value = null;
  }
  relogio = setInterval(() => (agora.value = Date.now()), 1000);
});
onBeforeUnmount(() => {
  clearInterval(relogio);
  clearTimeout(limparCopia);
});

async function copiar(valor: string, chave: string) {
  try {
    await navigator.clipboard.writeText(valor);
    copiado.value = chave;
    clearTimeout(limparCopia);
    limparCopia = setTimeout(() => {
      copiado.value = null;
      void navigator.clipboard.writeText('').catch(() => undefined);
    }, 30000);
  } catch {
    erro.value = 'O navegador não deixou copiar.';
  }
}
</script>

<template>
  <section v-if="conta && codigo" class="mt-6 rounded-celula bg-surface p-4" aria-label="Conta do aplicativo">
    <div class="flex items-start gap-3">
      <img v-if="logo" :src="logo" alt="" aria-hidden="true" class="h-10 w-10 shrink-0 rounded-[10px] bg-black object-contain p-1 ring-1 ring-separator" />
      <div v-else class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-accent/15 text-subhead font-bold text-accent" aria-hidden="true">
        {{ conta.titulo.substring(0, 2).toUpperCase() }}
      </div>
      <div class="min-w-0 flex-1 space-y-1">
        <p class="truncate text-headline font-semibold">{{ conta.titulo }}</p>
        <a v-if="conta.url" :href="conta.url" target="_blank" rel="noopener noreferrer" class="block truncate text-footnote text-accent">{{ conta.url }}</a>

        <div class="flex items-center gap-2 text-subhead">
          <span class="w-16 shrink-0 text-label-2">Usuário</span>
          <span class="truncate font-mono">{{ conta.usuario }}</span>
          <button type="button" class="text-accent" title="Copiar usuário" @click="copiar(conta.usuario, 'u')">
            <ClipboardDocumentIcon class="h-4 w-4" />
          </button>
          <span v-if="copiado === 'u'" class="text-caption-1 text-success">copiado</span>
        </div>

        <div class="flex items-center gap-2 text-subhead">
          <span class="w-16 shrink-0 text-label-2">2FA</span>
          <span class="font-mono text-title-3 tracking-widest text-accent">{{ codigo }}</span>
          <span class="text-caption-1 text-label-2">{{ resta }}s</span>
          <button type="button" class="text-accent" title="Copiar código" @click="copiar(codigo, 't')">
            <ClipboardDocumentIcon class="h-4 w-4" />
          </button>
          <span v-if="copiado === 't'" class="text-caption-1 text-success">copiado</span>
        </div>

        <p class="text-footnote text-label-2">Num aparelho novo, o aplicativo pede este código uma vez.</p>
        <p v-if="erro" role="alert" class="text-footnote text-danger">{{ erro }}</p>
      </div>
    </div>
  </section>
</template>
