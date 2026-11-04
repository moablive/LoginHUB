import { ref } from 'vue';
import { twoFactorApi } from '@loginhub/api-client';
import type { TwoFactorSetupResponse, TwoFactorStatus } from '@loginhub/schema';

/**
 * Composable de referência para o enrolamento de 2FA.
 *
 * O painel do LoginHUB é só do master, então nenhum usuário final passa por
 * aqui fora das telas públicas (convite e /enrolar-2fa) — isto existe também
 * para os apps clientes (Vue) copiarem. Fica em `apps/ui` de propósito: assim
 * o TypeScript do monorepo valida o exemplo a cada build, em vez de ele
 * apodrecer dentro de um bloco de markdown.
 *
 * Máquina de estados:
 *   idle → setup (secret na mão, ainda não confirmado) → ativo
 */
export type EtapaSetup = 'idle' | 'setup' | 'ativo';

interface ErroApi {
  response?: { data?: { error?: string; message?: string } };
}

/** Traduz o erro do backend. Os `error` são estáveis; as mensagens, não. */
function traduzir(e: unknown): string {
  const dados = (e as ErroApi)?.response?.data;
  switch (dados?.error) {
    case 'CODIGO_INVALIDO':
      return 'Código inválido. Confira o relógio do celular e tente o próximo.';
    case 'MUITAS_TENTATIVAS':
      return dados.message || 'Muitas tentativas. Aguarde alguns minutos.';
    case 'JA_ATIVO':
      return 'O 2FA já está ativo nesta conta.';
    default:
      return dados?.message || 'Não foi possível concluir a operação.';
  }
}

export function useTwoFactor() {
  const etapa = ref<EtapaSetup>('idle');
  const dadosSetup = ref<TwoFactorSetupResponse | null>(null);
  const backupCodes = ref<string[] | null>(null);
  const status = ref<TwoFactorStatus | null>(null);
  const erro = ref<string | null>(null);
  const carregando = ref(false);

  async function carregarStatus() {
    try {
      const s = await twoFactorApi.status();
      status.value = s;
      etapa.value = s.ativo ? 'ativo' : 'idle';
    } catch (e) {
      erro.value = traduzir(e);
    }
  }

  async function iniciar() {
    carregando.value = true;
    erro.value = null;
    try {
      dadosSetup.value = await twoFactorApi.setup();
      etapa.value = 'setup';
    } catch (e) {
      erro.value = traduzir(e);
    } finally {
      carregando.value = false;
    }
  }

  /**
   * Confirma a ativação.
   *
   * Dois efeitos que a tela precisa comunicar antes de o usuário clicar:
   * os `backupCodes` só aparecem AGORA, e as outras sessões dele caem —
   * inclusive as de outras abas e dispositivos.
   */
  async function confirmar(codigo: string) {
    carregando.value = true;
    erro.value = null;
    try {
      const r = await twoFactorApi.verifySetup(codigo);
      backupCodes.value = r.backupCodes;
      etapa.value = 'ativo';
      return true;
    } catch (e) {
      erro.value = traduzir(e);
      return false;
    } finally {
      carregando.value = false;
    }
  }

  async function desativar(prova: { codigo?: string; backupCode?: string }) {
    carregando.value = true;
    erro.value = null;
    try {
      await twoFactorApi.disable(prova);
      etapa.value = 'idle';
      dadosSetup.value = null;
      backupCodes.value = null;
      return true;
    } catch (e) {
      erro.value = traduzir(e);
      return false;
    } finally {
      carregando.value = false;
    }
  }

  return { etapa, dadosSetup, backupCodes, status, erro, carregando, carregarStatus, iniciar, confirmar, desativar };
}
