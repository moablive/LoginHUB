import { useCallback, useState } from 'react';
import { twoFactorApi } from '@loginhub/api-client';
import type { TwoFactorSetupResponse, TwoFactorStatus } from '@loginhub/schema';

/**
 * Hook de referência para o enrolamento de 2FA.
 *
 * O painel do LoginHUB é só do master, então nenhum usuário final passa por
 * aqui — isto existe para os apps clientes copiarem. Fica em `apps/ui` de
 * propósito: assim o TypeScript do monorepo valida o exemplo a cada build, em
 * vez de ele apodrecer dentro de um bloco de markdown.
 *
 * Máquina de estados:
 *   idle → setup (secret na mão, ainda não confirmado) → ativo
 */
export type EtapaSetup = 'idle' | 'setup' | 'ativo';

export function useTwoFactor() {
    const [etapa, setEtapa] = useState<EtapaSetup>('idle');
    const [dadosSetup, setDadosSetup] = useState<TwoFactorSetupResponse | null>(null);
    const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
    const [status, setStatus] = useState<TwoFactorStatus | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [carregando, setCarregando] = useState(false);

    /** Traduz o erro do backend. Os `error` são estáveis; as mensagens, não. */
    const traduzir = (e: unknown): string => {
        const codigo = (e as any)?.response?.data?.error;
        const mensagem = (e as any)?.response?.data?.message;
        switch (codigo) {
            case 'TENANT_NAO_HABILITADO':
                return 'Este aplicativo ainda não está liberado para 2FA.';
            case 'CODIGO_INVALIDO':
                return 'Código inválido. Confira o relógio do celular e tente o próximo.';
            case 'MUITAS_TENTATIVAS':
                return mensagem || 'Muitas tentativas. Aguarde alguns minutos.';
            case 'JA_ATIVO':
                return 'O 2FA já está ativo nesta conta.';
            default:
                return mensagem || 'Não foi possível concluir a operação.';
        }
    };

    const carregarStatus = useCallback(async () => {
        try {
            const s = await twoFactorApi.status();
            setStatus(s);
            setEtapa(s.ativo ? 'ativo' : 'idle');
        } catch (e) {
            setErro(traduzir(e));
        }
    }, []);

    const iniciar = useCallback(async () => {
        setCarregando(true);
        setErro(null);
        try {
            setDadosSetup(await twoFactorApi.setup());
            setEtapa('setup');
        } catch (e) {
            setErro(traduzir(e));
        } finally {
            setCarregando(false);
        }
    }, []);

    /**
     * Confirma a ativação.
     *
     * Dois efeitos que a tela precisa comunicar antes de o usuário clicar:
     * os `backupCodes` só aparecem AGORA, e as outras sessões dele caem —
     * inclusive as de outras abas e dispositivos.
     */
    const confirmar = useCallback(async (codigo: string) => {
        setCarregando(true);
        setErro(null);
        try {
            const r = await twoFactorApi.verifySetup(codigo);
            setBackupCodes(r.backupCodes);
            setEtapa('ativo');
            return true;
        } catch (e) {
            setErro(traduzir(e));
            return false;
        } finally {
            setCarregando(false);
        }
    }, []);

    const desativar = useCallback(async (prova: { codigo?: string; backupCode?: string }) => {
        setCarregando(true);
        setErro(null);
        try {
            await twoFactorApi.disable(prova);
            setEtapa('idle');
            setDadosSetup(null);
            setBackupCodes(null);
            return true;
        } catch (e) {
            setErro(traduzir(e));
            return false;
        } finally {
            setCarregando(false);
        }
    }, []);

    return {
        etapa, dadosSetup, backupCodes, status, erro, carregando,
        carregarStatus, iniciar, confirmar, desativar,
    };
}
