<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { CheckCircleIcon, ClipboardDocumentIcon } from '@heroicons/vue/24/outline';
import UiButton from '@/components/ui/UiButton.vue';
import { useTwoFactor } from './useTwoFactor';
import EscaneieComGoogleAuth from './EscaneieComGoogleAuth.vue';
import OutrosAutenticadores from './OutrosAutenticadores.vue';
import CodigoInput from './CodigoInput.vue';
import QrCode from './QrCode.vue';

/**
 * Tela de ativação de 2FA. Componente de referência para apps clientes.
 *
 * O QR sai pelo slot `qr` (padrão: o QrCode deste app). Um app cliente que
 * copie este componente troca pela biblioteca de QR que já usa; sem QR nenhum
 * a tela cai na digitação manual do secret, que todo autenticador aceita.
 */
const props = defineProps<{
  /**
   * Gera o secret assim que a tela abre, sem passar pelo botão "Ativar".
   *
   * Para enrolamento OBRIGATÓRIO — convite e `/enrolar-2fa`. Quem chega ali
   * não está escolhendo ligar o 2FA: veio redirecionado no meio do fluxo, com
   * um passe de 10 minutos, e a conta não abre sessão sem concluir. Perguntar
   * "quer ativar?" nesse ponto é uma pergunta sem resposta alternativa — e o
   * que acontecia na prática era a pessoa parar numa tela que parecia o fim
   * do caminho, sem QR nenhum.
   *
   * Fica `false` por padrão para não mudar o comportamento de quem use este
   * componente numa tela de configurações, onde ativar é de fato opcional.
   */
  autoIniciar?: boolean;
}>();

const { etapa, dadosSetup, backupCodes, status, erro, carregando, carregarStatus, iniciar, confirmar } = useTwoFactor();
const codigo = ref('');
const copiado = ref(false);
let autoTentado = false;

// Uma vez por montagem. `/2fa/status` divide com `/2fa/setup` o mesmo balde de
// 10 requisições por 15 minutos e por usuário: pedir em dobro (era o que o
// StrictMode do React fazia) levava quem recarregasse a tela três vezes ao
// MUITAS_TENTATIVAS, sem conseguir enrolar o próprio 2FA.
onMounted(() => void carregarStatus());

// Uma vez só: `iniciar()` descarta o secret anterior a cada chamada (é o botão
// "gerar outro QR"), então repetir aqui trocaria o código embaixo de quem já
// estivesse escaneando.
watch(status, (s) => {
  if (!props.autoIniciar || autoTentado || s === null || s.ativo) return;
  autoTentado = true;
  void iniciar();
});

async function copiar() {
  if (!backupCodes.value) return;
  try {
    await navigator.clipboard.writeText(backupCodes.value.join('\n'));
    copiado.value = true;
  } catch {
    /* sem permissão de área de transferência: os códigos seguem na tela */
  }
}
</script>

<template>
  <!-- concluído agora: os códigos de recuperação só aparecem esta vez -->
  <div v-if="etapa === 'ativo' && backupCodes" class="space-y-4">
    <div class="flex items-center gap-2">
      <CheckCircleIcon class="h-6 w-6 text-success" />
      <h2 class="text-title-3 font-semibold">2FA ativado</h2>
    </div>
    <div class="rounded-celula bg-warning/10 p-4">
      <p class="text-subhead font-semibold">Guarde estes códigos agora.</p>
      <p class="mt-1 text-footnote text-label-2">
        Eles não voltam a ser exibidos e são a sua única entrada se você perder o celular. Cada um serve uma vez só.
      </p>
    </div>
    <ul class="grid grid-cols-2 gap-2 font-mono text-subhead">
      <li v-for="c in backupCodes" :key="c" class="rounded-lg bg-fill-2 px-3 py-2 text-center">{{ c }}</li>
    </ul>
    <UiButton variante="tinted" bloco @click="copiar">
      <ClipboardDocumentIcon class="h-5 w-5" />
      {{ copiado ? 'Copiado' : 'Copiar todos' }}
    </UiButton>
    <p class="text-footnote text-label-2">
      Suas outras sessões foram encerradas. Você precisará entrar de novo nos outros dispositivos.
    </p>
  </div>

  <div v-else-if="etapa === 'ativo'" class="space-y-1 text-center">
    <h2 class="text-title-3 font-semibold">2FA está ativo</h2>
    <p class="text-subhead text-label-2">Restam {{ status?.backupCodesRestantes ?? 0 }} códigos de recuperação.</p>
  </div>

  <div v-else-if="etapa === 'setup' && dadosSetup" class="space-y-4">
    <EscaneieComGoogleAuth :emissor="dadosSetup.issuer" />

    <slot name="qr" :uri="dadosSetup.otpauthUri" :logo="dadosSetup.appLogo">
      <QrCode :uri="dadosSetup.otpauthUri" :logo="dadosSetup.appLogo" />
    </slot>

    <div class="rounded-celula bg-fill-2 p-3">
      <p class="text-caption-1 text-label-2">Conta no Google Authenticator</p>
      <p class="text-subhead">
        <strong>{{ dadosSetup.issuer }}</strong> · {{ dadosSetup.label }}
      </p>
      <p class="mt-2 text-caption-1 text-label-2">Chave (digitação manual)</p>
      <code class="block select-all break-all font-mono text-subhead">{{ dadosSetup.secret }}</code>
    </div>

    <CodigoInput v-model="codigo" rotulo="Código de 6 dígitos do autenticador" />

    <p v-if="erro" role="alert" class="text-subhead text-danger">{{ erro }}</p>

    <UiButton tamanho="large" bloco :carregando="carregando" :disabled="codigo.length !== 6" @click="confirmar(codigo)">
      {{ carregando ? 'Confirmando…' : 'Ativar 2FA' }}
    </UiButton>

    <OutrosAutenticadores />
  </div>

  <!-- Enrolamento obrigatório em curso: nada a perguntar, só esperar o secret.
       Se der erro, o botão vira "Tentar de novo" — antes a falha aparecia ao
       lado de um "Ativar" que dava a entender que nada tinha sido tentado. -->
  <div v-else-if="autoIniciar && !erro" class="space-y-4 text-center">
    <h2 class="text-headline font-semibold">Gerando o seu código…</h2>
    <p class="text-subhead text-label-2">Abra o Google Authenticator no celular. O QR aparece aqui em instantes.</p>
    <div class="mx-auto h-[220px] w-[220px] animate-pulse rounded-celula bg-fill-2" />
  </div>

  <div v-else class="space-y-4">
    <h2 class="text-headline font-semibold">Verificação em duas etapas</h2>
    <p class="text-subhead text-label-2">
      Além da senha, o acesso passa a exigir um código de 6 dígitos gerado no seu celular.
    </p>
    <p v-if="erro" role="alert" class="text-subhead text-danger">{{ erro }}</p>
    <UiButton bloco :carregando="carregando" @click="iniciar">
      {{ carregando ? 'Gerando…' : erro ? 'Tentar de novo' : 'Ativar' }}
    </UiButton>
  </div>
</template>
