/**
 * Indicativo visual de "escaneie com o Google Authenticator".
 *
 * Antes a tela dizia "Google Authenticator, Authy, 1Password ou Microsoft
 * Authenticator" em texto corrido, e a pessoa parava no QR sem saber com o que
 * ler. Agora um app só é o caminho indicado, com ícone, passos e loja; os
 * outros continuam funcionando e são citados no rodapé.
 *
 * Os apps clientes (Vue) repetem este bloco com o mesmo texto e os mesmos
 * links — se mudar aqui, mude lá.
 */

export const GOOGLE_AUTH_PLAY = 'https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2';
export const GOOGLE_AUTH_APPSTORE = 'https://apps.apple.com/app/google-authenticator/id388497605';

/** Ícone desenhado aqui (as cores do Google), sem imagem remota. */
export function GoogleAuthIcon({ tamanho = 40 }: { tamanho?: number }) {
    return (
        <svg width={tamanho} height={tamanho} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
            <rect width="48" height="48" rx="11" fill="#fff" />
            <path d="M24 8a16 16 0 0 1 13.86 8L31 20a8 8 0 0 0-7-4z" fill="#EA4335" />
            <path d="M37.86 16a16 16 0 0 1 0 16L31 28a8 8 0 0 0 0-8z" fill="#FBBC05" />
            <path d="M37.86 32A16 16 0 0 1 24 40v-8a8 8 0 0 0 7-4z" fill="#34A853" />
            <path d="M24 40a16 16 0 0 1 0-32v8a8 8 0 0 0 0 16z" fill="#4285F4" />
            <rect x="24" y="21.5" width="16" height="5" rx="2.5" fill="#4285F4" />
            <circle cx="24" cy="24" r="4" fill="#fff" />
        </svg>
    );
}

/** Faixa de cadastro: ícone, passos e onde baixar. Vai logo acima do QR. */
export function EscaneieComGoogleAuth({ emissor }: { emissor?: string }) {
    return (
        <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
            <div className="flex items-center gap-3">
                <GoogleAuthIcon />
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">Escaneie com</p>
                    <p className="text-base font-bold text-foreground">Google Authenticator</p>
                </div>
            </div>

            <ol className="mt-3 space-y-1 text-sm text-foreground">
                <li><span className="font-semibold text-primary">1.</span> Abra o Google Authenticator no celular.</li>
                <li><span className="font-semibold text-primary">2.</span> Toque em <strong>+</strong> e depois em <strong>Ler código QR</strong>.</li>
                <li>
                    <span className="font-semibold text-primary">3.</span> Digite abaixo os 6 dígitos que aparecem em{' '}
                    <strong>{emissor || 'nome do aplicativo'}</strong>.
                </li>
            </ol>

            <p className="mt-3 text-xs text-muted-foreground">
                Ainda não tem?{' '}
                <a href={GOOGLE_AUTH_PLAY} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">Android</a>
                {' · '}
                <a href={GOOGLE_AUTH_APPSTORE} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">iPhone</a>
            </p>
        </div>
    );
}

/** Linha curta para a tela que PEDE o código, no login. */
export function DigiteDoGoogleAuth({ emissor }: { emissor?: string }) {
    return (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
            <GoogleAuthIcon tamanho={32} />
            <p className="text-sm text-foreground">
                Abra o <strong>Google Authenticator</strong> e digite o código de 6 dígitos
                {emissor ? <> de <strong>{emissor}</strong></> : ' desta conta'}.
            </p>
        </div>
    );
}

/** Rodapé: quem já usa outro autenticador não precisa trocar. */
export function OutrosAutenticadores() {
    return (
        <p className="text-center text-xs text-muted-foreground">
            Authy, 1Password e Microsoft Authenticator também funcionam.
        </p>
    );
}
