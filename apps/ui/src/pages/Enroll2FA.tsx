import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';
import { TwoFactorSetup } from '../features/twoFactor/TwoFactorSetup';
import { QrCode } from '../features/twoFactor/QrCode';

/**
 * Tela de enrolamento de 2FA compartilhada por TODOS os apps do hub.
 *
 * Um app cliente que recebe `require2FASetup` no login tem em mãos um passe de
 * 10 minutos e nenhuma tela para gastá-lo. Em vez de cada um dos oito
 * reimplementar QR, digitação manual e códigos de recuperação — e divergir —,
 * todos mandam a pessoa para cá:
 *
 *     https://loginhub.astralwavelabel.com/enrolar-2fa?token=<setupToken>
 *
 * O passe entra pela query string porque é exatamente o que o app cliente tem;
 * ele não abre rota nenhuma além das de enrolamento, e vale 10 minutos.
 *
 * `retorno` (opcional) leva a pessoa de volta ao app depois de concluir.
 */
export function Enroll2FA() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const retorno = searchParams.get('retorno');
    const [pronto, setPronto] = useState(false);

    useEffect(() => {
        if (!token) return;
        // O `twoFactorApi` lê a credencial do storage, como em qualquer outra
        // tela. Gravar o passe aqui é o que permite reusar o componente de
        // enrolamento sem duplicá-lo com uma versão "que recebe token por prop".
        localStorage.setItem('awl_token', token);
        setPronto(true);
    }, [token]);

    if (!token) {
        return (
            <Moldura titulo="Link inválido">
                <p className="text-sm text-muted-foreground">
                    Este endereço precisa do passe de enrolamento que o seu aplicativo emite ao
                    fazer login. Volte ao app e entre de novo para gerar um novo — ele vale 10 minutos.
                </p>
            </Moldura>
        );
    }

    if (!pronto) return null;

    return (
        <Moldura titulo="Configure a verificação em duas etapas">
            <p className="mb-6 text-center text-sm text-muted-foreground">
                Esta conta exige um segundo fator. Escaneie o código com o seu aplicativo
                autenticador — Google Authenticator, Authy, 1Password ou Microsoft Authenticator.
            </p>

            <TwoFactorSetup autoIniciar renderQr={(uri) => <QrCode uri={uri} />} />

            {retorno && (
                <div className="mt-8 border-t border-border pt-6 text-center">
                    <a
                        href={retorno}
                        className="inline-block w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        Voltar para o aplicativo
                    </a>
                    {/* A sessão nasce no app, não aqui: atravessar origens com o
                        token seria pior. Dizer isso evita a impressão de que o
                        enrolamento não terminou. */}
                    <p className="mt-3 text-xs text-muted-foreground">
                        Lá você entra com a senha nova e o código do autenticador.
                        Se o código acabou de ser usado, espere o próximo (30s).
                    </p>
                </div>
            )}
        </Moldura>
    );
}

function Moldura({ titulo, children }: { titulo: string; children: React.ReactNode }) {
    return (
        <div className="min-h-screen min-h-dvh bg-background flex items-center justify-center p-4 py-8">
            <div className="bg-card text-card-foreground rounded-2xl shadow-xl max-w-md w-full p-6 sm:p-8 border border-border">
                <div className="text-center mb-6">
                    <div className="mx-auto w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-4">
                        <ShieldCheckIcon className="w-8 h-8 text-primary" />
                    </div>
                    <h2 className="text-xl font-bold text-foreground">{titulo}</h2>
                </div>
                {children}
            </div>
        </div>
    );
}
