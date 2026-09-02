import { useState } from 'react';
import { twoFactorApi } from '@loginhub/api-client';

interface Props {
    /** Vem de `authApi.login(...)` quando ele devolve `requires2FA`. */
    challengeToken: string;
    onAutenticado: () => void;
    onCancelar?: () => void;
}

/**
 * Segunda etapa do login. Componente de referência para apps clientes.
 *
 * O `challengeToken` vale 5 minutos e serve só para esta troca — não é sessão
 * e não abre rota nenhuma. Se expirar, o caminho é refazer o login.
 */
export function TwoFactorChallenge({ challengeToken, onAutenticado, onCancelar }: Props) {
    const [codigo, setCodigo] = useState('');
    const [usarBackup, setUsarBackup] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);

    const enviar = async (e: React.FormEvent) => {
        e.preventDefault();
        setEnviando(true);
        setErro(null);
        try {
            if (usarBackup) {
                await twoFactorApi.verifyBackup(challengeToken, codigo);
            } else {
                await twoFactorApi.verify(challengeToken, codigo);
            }
            onAutenticado();
        } catch (err: any) {
            const cod = err?.response?.data?.error;
            setErro(
                cod === 'CHALLENGE_INVALIDO'
                    ? 'A janela de verificação expirou. Faça login novamente.'
                    : cod === 'MUITAS_TENTATIVAS'
                        ? err?.response?.data?.message
                        : 'Código inválido.',
            );
        } finally {
            setEnviando(false);
        }
    };

    return (
        <form onSubmit={enviar} className="max-w-sm w-full space-y-4">
            <div>
                <h2 className="text-xl font-semibold text-foreground">Verificação em duas etapas</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    {usarBackup
                        ? 'Digite um dos códigos de recuperação que você guardou.'
                        : 'Digite o código de 6 dígitos do seu aplicativo autenticador.'}
                </p>
            </div>

            <input
                value={codigo}
                onChange={(e) => setCodigo(usarBackup ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, '').slice(0, 6))}
                // O código TOTP é numérico e curto; o de recuperação tem letras
                // e hífen. `inputMode` muda o teclado do celular conforme o caso.
                inputMode={usarBackup ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                autoCapitalize={usarBackup ? 'characters' : 'off'}
                autoCorrect="off"
                spellCheck={false}
                placeholder={usarBackup ? 'XXXXX-XXXXX' : '000000'}
                maxLength={usarBackup ? 11 : 6}
                // Sem autoFocus no celular: abrir o teclado durante a montagem
                // rola a tela sozinha e, no iOS, o foco às vezes fica sem
                // teclado nenhum. No desktop o foco automático segue valendo.
                autoFocus={typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches}
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-3 text-center text-lg tracking-widest text-foreground focus:border-primary focus:outline-none"
            />

            {erro && (
                <p className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{erro}</p>
            )}

            <button
                type="submit"
                disabled={enviando || (usarBackup ? codigo.length < 11 : codigo.length !== 6)}
                className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
            >
                {enviando ? 'Verificando...' : 'Verificar'}
            </button>

            <div className="flex justify-between text-sm">
                <button
                    type="button"
                    onClick={() => { setUsarBackup(!usarBackup); setCodigo(''); setErro(null); }}
                    className="text-primary hover:underline"
                >
                    {usarBackup ? 'Usar o aplicativo autenticador' : 'Perdi o acesso ao autenticador'}
                </button>
                {onCancelar && (
                    <button type="button" onClick={onCancelar} className="text-muted-foreground hover:underline">
                        Cancelar
                    </button>
                )}
            </div>
        </form>
    );
}
