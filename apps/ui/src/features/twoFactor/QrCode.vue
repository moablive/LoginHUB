<script setup lang="ts">
import { ref, watchEffect } from 'vue';
import QRCode from 'qrcode';

/**
 * Desenha o QR do enrolamento a partir da URI `otpauth://`.
 *
 * O desenho é feito AQUI, no navegador: o servidor devolve a URI e nunca uma
 * imagem. Trafegar PNG em base64 pela API só engordaria a resposta, e mandar o
 * QR por e-mail colocaria os dois fatores no mesmo canal — o mesmo e-mail
 * carrega o magic link de senha.
 *
 * `margin: 1` e não o padrão 4: a "quiet zone" cheia deixa o código minúsculo
 * dentro de um card estreito, e os leitores de autenticador toleram folga menor.
 *
 * Com logo, a correção de erro sobe para `H` (30% de redundância): o logo cobre
 * uns 5% da área e o código continua lendo mesmo com reflexo na tela. Sem logo
 * fica em `M`, que dá módulos maiores e lê mais fácil de longe.
 */
const props = withDefaults(
  defineProps<{
    /** URI `otpauth://` devolvida por `/auth/2fa/setup`. */
    uri: string;
    tamanho?: number;
    /** Logo do app, sobreposto no centro do código. */
    logo?: string | null;
  }>(),
  { tamanho: 220 },
);

const dataUrl = ref<string | null>(null);
const erro = ref(false);

watchEffect((aoLimpar) => {
  let vivo = true;
  aoLimpar(() => (vivo = false));
  dataUrl.value = null;
  QRCode.toDataURL(props.uri, { width: props.tamanho, margin: 1, errorCorrectionLevel: props.logo ? 'H' : 'M' })
    .then((url) => {
      if (vivo) dataUrl.value = url;
    })
    .catch(() => {
      if (vivo) erro.value = true;
    });
});
</script>

<template>
  <!-- Sem QR a pessoa não fica sem saída: o secret em texto continua na tela e
       todo autenticador aceita digitação manual. -->
  <p v-if="erro" class="text-subhead text-label-2">
    Não foi possível desenhar o QR. Use a chave abaixo para adicionar manualmente.
  </p>
  <div v-else-if="!dataUrl" :style="{ width: `${tamanho}px`, height: `${tamanho}px` }" class="mx-auto animate-pulse rounded-celula bg-fill-2" />
  <div v-else class="relative mx-auto w-fit rounded-[16px] bg-white p-3 shadow-flutuante ring-1 ring-black/5">
    <img :src="dataUrl" :width="tamanho" :height="tamanho" alt="QR code para escanear com o Google Authenticator" class="block" />
    <img
      v-if="logo"
      :src="logo"
      alt=""
      :style="{ width: `${tamanho * 0.22}px`, height: `${tamanho * 0.22}px` }"
      class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-white object-contain p-1 shadow"
    />
  </div>
</template>
