/**
 * Login por biometria (passkey / WebAuthn) do LoginHUB para os frontends dos apps.
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ ARQUIVO SINCRONIZADO — não edite a cópia dentro de um app cliente.     │
 * │ Fonte: LoginHUB/packages/auth-kit/src/hubPasskeyClient.ts              │
 * │ Propague com: LoginHUB/scripts/sync-auth-kit.sh                        │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * A digital ou o rosto libera uma chave guardada no aparelho; o hub confere a
 * assinatura e devolve a MESMA sessão do login com senha + código. Só dá para
 * ativar com sessão completa (o `token` passado em `ativar`).
 *
 * Sem dependência: a conversa com `navigator.credentials` é feita aqui, com a
 * conversão base64url ↔ ArrayBuffer à mão, para o arquivo servir em qualquer
 * app sem mexer no package.json dele. Separado do `hubAuthClient` de propósito:
 * só recebe este arquivo o app que tem `aplicativos.webauthn_rp_id` no hub.
 */

export interface HubPasskeyConfig {
    /** Base da API do hub, ex.: `https://loginhub.astralwavelabel.com/api`. */
    baseUrl: string;
    /** ID deste app no hub. */
    appId: string | number;
}

/** Sessão devolvida pelo login por biometria: o mesmo formato do login normal. */
export interface HubPasskeySessao {
    token: string;
    expiresIn: number;
    usuario?: { id: string; nome: string; email: string; role?: string };
    app?: { id: string; nome: string; status?: string };
}

export interface HubPasskey {
    id: number;
    nome: string;
    criado_em: string | null;
    ultimo_uso: string | null;
}

/**
 * `code`:
 *   CANCELADO     a pessoa fechou a janela da biometria (ou o tempo acabou);
 *   NAO_SUPORTADO o navegador não tem WebAuthn;
 *   REDE          sem conexão com o hub;
 *   o resto vem do hub (`PASSKEY_INVALIDA`, `CHALLENGE_INVALIDO`, ...).
 */
export class HubPasskeyError extends Error {
    constructor(public code: string, message: string, public status = 0) {
        super(message);
        this.name = 'HubPasskeyError';
    }
}

const deB64u = (texto: string): ArrayBuffer => {
    const b64 = texto.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
};

const paraB64u = (buffer: ArrayBuffer | null | undefined): string | undefined => {
    if (!buffer) return undefined;
    const bytes = new Uint8Array(buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

type Json = Record<string, any>;

/** O navegador tem WebAuthn? (Exige https; em `http://` de rede local não há.) */
export const biometriaSuportada = (): boolean =>
    typeof window !== 'undefined' &&
    window.isSecureContext === true &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    !!navigator.credentials;

/** Este aparelho tem leitor de digital/rosto (ou PIN do sistema) para passkey? */
export async function biometriaDoAparelho(): Promise<boolean> {
    if (!biometriaSuportada()) return false;
    try {
        return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
        return false;
    }
}

const traduzirErroDoNavegador = (e: unknown): HubPasskeyError => {
    if (e instanceof HubPasskeyError) return e;
    const nome = (e as { name?: string })?.name;
    if (nome === 'NotAllowedError' || nome === 'AbortError') return new HubPasskeyError('CANCELADO', 'Biometria cancelada.');
    if (nome === 'InvalidStateError') return new HubPasskeyError('PASSKEY_JA_CADASTRADA', 'Este aparelho já está cadastrado.');
    return new HubPasskeyError('NAO_SUPORTADO', 'Este aparelho não conseguiu usar a biometria.');
};

export function createHubPasskey(config: HubPasskeyConfig) {
    const base = config.baseUrl.replace(/\/+$/, '');
    const appId = String(config.appId);

    async function chamar<T>(metodo: string, caminho: string, corpo?: unknown, token?: string): Promise<T> {
        let resposta: Response;
        try {
            resposta = await fetch(`${base}${caminho}`, {
                method: metodo,
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: corpo === undefined ? undefined : JSON.stringify(corpo),
            });
        } catch {
            throw new HubPasskeyError('REDE', 'Sem conexão com o servidor de login.');
        }
        const dados = (await resposta.json().catch(() => ({}))) as Json;
        if (!resposta.ok) {
            throw new HubPasskeyError(String(dados.error || 'ERRO'), String(dados.message || 'Não foi possível concluir.'), resposta.status);
        }
        return dados as T;
    }

    return {
        /** O hub tem biometria ligada para este app? A tela de login usa para mostrar o botão. */
        async disponivel(): Promise<boolean> {
            if (!biometriaSuportada()) return false;
            try {
                const r = await chamar<{ disponivel: boolean }>('GET', `/auth/passkey/disponivel?app_id=${encodeURIComponent(appId)}`);
                return r.disponivel === true;
            } catch {
                return false;
            }
        },

        /**
         * Entra com a digital ou o rosto. A pessoa não digita nem o e-mail: o
         * aparelho mostra as passkeys que tem para este site.
         */
        async entrar(): Promise<HubPasskeySessao> {
            if (!biometriaSuportada()) throw new HubPasskeyError('NAO_SUPORTADO', 'Este navegador não tem login por biometria.');
            const { opcoes, challengeToken } = await chamar<{ opcoes: Json; challengeToken: string }>('POST', '/auth/passkey/login/opcoes', { app_id: appId });

            let credencial: PublicKeyCredential | null;
            try {
                credencial = (await navigator.credentials.get({
                    publicKey: {
                        challenge: deB64u(opcoes.challenge),
                        rpId: opcoes.rpId,
                        timeout: opcoes.timeout,
                        userVerification: opcoes.userVerification,
                        allowCredentials: (opcoes.allowCredentials ?? []).map((c: Json) => ({ type: 'public-key', id: deB64u(c.id), transports: c.transports })),
                    },
                })) as PublicKeyCredential | null;
            } catch (e) {
                throw traduzirErroDoNavegador(e);
            }
            if (!credencial) throw new HubPasskeyError('CANCELADO', 'Biometria cancelada.');

            const r = credencial.response as AuthenticatorAssertionResponse;
            const sessao = await chamar<HubPasskeySessao>('POST', '/auth/passkey/login/verificar', {
                app_id: appId,
                challengeToken,
                resposta: {
                    id: credencial.id,
                    rawId: paraB64u(credencial.rawId),
                    type: credencial.type,
                    clientExtensionResults: {},
                    response: {
                        clientDataJSON: paraB64u(r.clientDataJSON),
                        authenticatorData: paraB64u(r.authenticatorData),
                        signature: paraB64u(r.signature),
                        userHandle: paraB64u(r.userHandle),
                    },
                },
            });
            // Mesma guarda do hubAuthClient: nunca devolver sessão sem token.
            if (typeof sessao.token !== 'string' || !sessao.token) throw new HubPasskeyError('ERRO', 'O servidor de login não devolveu a sessão.');
            return sessao;
        },

        /**
         * Cadastra a biometria deste aparelho. `token` é a sessão completa de
         * quem já entrou com senha + código; `nome` aparece na lista de aparelhos.
         */
        async ativar(token: string, nome: string): Promise<HubPasskey> {
            if (!biometriaSuportada()) throw new HubPasskeyError('NAO_SUPORTADO', 'Este navegador não tem login por biometria.');
            const { opcoes, challengeToken } = await chamar<{ opcoes: Json; challengeToken: string }>('POST', '/auth/passkey/registro/opcoes', {}, token);

            let credencial: PublicKeyCredential | null;
            try {
                credencial = (await navigator.credentials.create({
                    publicKey: {
                        rp: opcoes.rp,
                        user: { id: deB64u(opcoes.user.id), name: opcoes.user.name, displayName: opcoes.user.displayName },
                        challenge: deB64u(opcoes.challenge),
                        pubKeyCredParams: opcoes.pubKeyCredParams,
                        timeout: opcoes.timeout,
                        attestation: opcoes.attestation,
                        authenticatorSelection: opcoes.authenticatorSelection,
                        excludeCredentials: (opcoes.excludeCredentials ?? []).map((c: Json) => ({ type: 'public-key', id: deB64u(c.id), transports: c.transports })),
                    },
                })) as PublicKeyCredential | null;
            } catch (e) {
                throw traduzirErroDoNavegador(e);
            }
            if (!credencial) throw new HubPasskeyError('CANCELADO', 'Biometria cancelada.');

            const r = credencial.response as AuthenticatorAttestationResponse;
            return chamar<HubPasskey>(
                'POST',
                '/auth/passkey/registro/verificar',
                {
                    challengeToken,
                    nome,
                    resposta: {
                        id: credencial.id,
                        rawId: paraB64u(credencial.rawId),
                        type: credencial.type,
                        clientExtensionResults: {},
                        response: {
                            clientDataJSON: paraB64u(r.clientDataJSON),
                            attestationObject: paraB64u(r.attestationObject),
                            transports: typeof r.getTransports === 'function' ? r.getTransports() : [],
                        },
                    },
                },
                token,
            );
        },

        /** Aparelhos com biometria da conta. */
        listar: (token: string) => chamar<HubPasskey[]>('GET', '/auth/passkey', undefined, token),

        /** Remove a biometria de um aparelho (a passkey para de entrar). */
        async remover(token: string, id: number): Promise<void> {
            await chamar('DELETE', `/auth/passkey/${id}`, undefined, token);
        },
    };
}

export type HubPasskeyClient = ReturnType<typeof createHubPasskey>;
