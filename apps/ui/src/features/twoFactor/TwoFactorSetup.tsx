import { useEffect, useState } from 'react';
import { useTwoFactor } from './useTwoFactor';

interface Props {
    /**
     * Renderiza o QR a partir da URI `otpauth://`.
     *
     * Fica por conta do app cliente de propósito: o LoginHUB não embute nenhuma
     * biblioteca de QR, então cada app usa a sua (`qrcode.react`, `qrcode`...)
     * sem o hub impor a escolha. Sem esta prop, o componente cai na digitação
     * manual do secret — que todo autenticador aceita.
     */
    renderQr?: (otpauthUri: string) => React.ReactNode;
}

/** Tela de ativação de 2FA. Componente de referência para apps clientes. */
export function TwoFactorSetup({ renderQr }: Props) {
    const { etapa, dadosSetup, backupCodes, status, erro, carregando, carregarStatus, iniciar, confirmar } = useTwoFactor();
    const [codigo, setCodigo] = useState('');
    const [copiado, setCopiado] = useState(false);

    useEffect(() => { void carregarStatus(); }, [carregarStatus]);

    if (etapa === 'ativo' && backupCodes) {
        return (
            <div className="max-w-md space-y-4">
                <h2 className="text-xl font-semibold text-foreground">2FA ativado</h2>
                <div className="rounded-md border border-warning/40 bg-warning/10 p-4 text-sm">
                    <strong className="block text-foreground">Guarde estes códigos agora.</strong>
                    <span className="text-muted-foreground">
                        Eles não voltam a ser exibidos e são a sua única entrada se você perder o celular.
                        Cada um serve uma vez só.
                    </span>
                </div>
                <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
                    {backupCodes.map((c) => (
                        <li key={c} className="rounded border border-border bg-background px-3 py-2 text-center">{c}</li>
                    ))}
                </ul>
                <button
                    onClick={() => { void navigator.clipboard.writeText(backupCodes.join('\n')); setCopiado(true); }}
                    className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
                >
                    {copiado ? 'Copiado' : 'Copiar todos'}
                </button>
                <p className="text-xs text-muted-foreground">
                    Suas outras sessões foram encerradas. Você precisará entrar de novo nos outros dispositivos.
                </p>
            </div>
        );
    }

    if (etapa === 'ativo') {
        return (
            <div className="max-w-md space-y-2">
                <h2 className="text-xl font-semibold text-foreground">2FA está ativo</h2>
                <p className="text-sm text-muted-foreground">
                    Restam {status?.backupCodesRestantes ?? 0} códigos de recuperação.
                </p>
            </div>
        );
    }

    if (etapa === 'setup' && dadosSetup) {
        return (
            <div className="max-w-md space-y-4">
                <h2 className="text-xl font-semibold text-foreground">Escaneie e confirme</h2>

                {renderQr
                    ? renderQr(dadosSetup.otpauthUri)
                    : (
                        <p className="text-sm text-muted-foreground">
                            Adicione manualmente no autenticador com a chave abaixo.
                        </p>
                    )}

                <div className="rounded-md border border-border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">Conta</p>
                    <p className="text-sm text-foreground">{dadosSetup.label}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Chave (digitação manual)</p>
                    <code className="block break-all font-mono text-sm text-foreground">{dadosSetup.secret}</code>
                </div>

                <input
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    className="w-full rounded-lg border border-input bg-background px-3 py-3 text-center text-lg tracking-widest text-foreground focus:border-primary focus:outline-none"
                />

                {erro && <p className="text-sm text-danger">{erro}</p>}

                <button
                    onClick={() => void confirmar(codigo)}
                    disabled={carregando || codigo.length !== 6}
                    className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
                >
                    {carregando ? 'Confirmando...' : 'Ativar 2FA'}
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-md space-y-4">
            <h2 className="text-xl font-semibold text-foreground">Verificação em duas etapas</h2>
            <p className="text-sm text-muted-foreground">
                Além da senha, o acesso passa a exigir um código de 6 dígitos gerado no seu celular.
            </p>
            {erro && <p className="text-sm text-danger">{erro}</p>}
            <button
                onClick={() => void iniciar()}
                disabled={carregando}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
            >
                {carregando ? 'Gerando...' : 'Ativar'}
            </button>
        </div>
    );
}
