/**
 * Cliente de autenticação do LoginHUB para os frontends dos apps.
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ ARQUIVO SINCRONIZADO — não edite a cópia dentro de um app cliente.     │
 * │ Fonte: LoginHUB/packages/auth-kit/src/hubAuthClient.ts                 │
 * │ Propague com: LoginHUB/scripts/sync-auth-kit.sh                        │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * POR QUE ISTO EXISTE
 *
 * `/auth/login` e `/auth/setup-password` respondem 200 em TRÊS desfechos
 * diferentes, e só um deles traz sessão. Cliente que assume "200 = token na
 * mão" grava `undefined` no storage, e como `!!'undefined'` é `true`, o app se
 * considera autenticado e entra num laço de 401 sem nunca mostrar um erro.
 *
 *   sessão   → token de 24 h, segue direto
 *   desafio  → 2FA ativo: `challengeToken` (5 min) troca por sessão no /2fa/verify
 *   enrolar  → 2FA exigido e não configurado: passe (10 min) que só abre o enrolamento
 *
 * Este módulo devolve uma união discriminada por `status`, então o compilador
 * obriga quem chama a tratar os três. Ele NUNCA grava um token indefinido.
 *
 * Sem dependência de framework nem de axios — só `fetch`. É o mesmo arquivo em
 * Vue, React e página estática; o que muda é a config passada no `createHubAuth`.
 */

// ==========================================
// TIPOS
// ==========================================

export interface HubUser {
    id: string;
    nome: string;
    email: string;
    role: string;
}

export interface HubApp {
    id: string;
    nome: string;
    status: string;
}

export interface HubSessionData {
    token: string;
    expiresIn: number;
    usuario?: HubUser;
    app?: HubApp;
}

export type MetodoSegundoFator = 'totp' | 'backup';

/** Desfecho do `/auth/login`. Trate os três — o compilador cobra. */
export type LoginResult =
    | { status: 'sessao'; session: HubSessionData }
    | { status: 'desafio'; challengeToken: string; expiresIn: number; methods: MetodoSegundoFator[] }
    | { status: 'enrolar'; setupToken: string; expiresIn: number };

/** Desfecho do `/auth/setup-password`. Os mesmos três, pela mesma razão. */
export type SetupPasswordResult =
    | { status: 'sessao'; session: HubSessionData; message: string }
    | { status: 'desafio'; challengeToken: string; expiresIn: number; methods: MetodoSegundoFator[]; message: string }
    | { status: 'enrolar'; setupToken: string; expiresIn: number; message: string };

export interface TwoFactorSetupData {
    secret: string;
    otpauthUri: string;
    label: string;
    issuer: string;
}

export interface TwoFactorActivation {
    ativo: true;
    backupCodes: string[];
    sessoesAnterioresInvalidadas: boolean;
    token: string;
    expiresIn: number;
}

export interface TwoFactorStatusData {
    ativo: boolean;
    obrigatorio: boolean;
    confirmadoEm?: string | null;
    backupCodesRestantes: number;
}

/** Erro com o código estável do hub (`CODIGO_INVALIDO`, `MUITAS_TENTATIVAS`...). */
export class HubApiError extends Error {
    // Campos declarados e atribuidos no corpo, e nao como parameter properties
    // (`constructor(public readonly status: number)`): `erasableSyntaxOnly`,
    // ligado em parte dos apps, recusa essa sintaxe. Este arquivo e copiado
    // para todos eles, entao vale o denominador comum.
    readonly status: number;
    readonly code: string;

    constructor(status: number, code: string, message: string) {
        super(message);
        this.name = 'HubApiError';
        this.status = status;
        this.code = code;
    }
}

export interface HubStorage {
    get(key: string): string | null;
    set(key: string, valor: string): void;
    remove(key: string): void;
}

export interface HubAuthConfig {
    /** Base da API do hub, ex.: `https://loginhub.astralwavelabel.com/api`. */
    baseUrl: string;
    /**
     * ID deste app no hub.
     *
     * Sem ele, um e-mail cadastrado em mais de um app devolve 409
     * AMBIGUOUS_EMAIL — que na prática é o login falhando sem explicação.
     */
    appId?: string | number;
    /** Onde guardar a sessão. Padrão: `localStorage`. */
    storage?: HubStorage;
    /** Chaves do storage. Cada app já tem as suas — mantenha as existentes. */
    tokenKey?: string;
    userKey?: string;
    appKey?: string;
}

// ==========================================
// INFRA
// ==========================================

const storagePadrao = (): HubStorage => {
    const disponivel = typeof localStorage !== 'undefined';
    return {
        get: (k) => (disponivel ? localStorage.getItem(k) : null),
        set: (k, v) => { if (disponivel) localStorage.setItem(k, v); },
        remove: (k) => { if (disponivel) localStorage.removeItem(k); },
    };
};

/**
 * `true` só para string não vazia.
 *
 * É a checagem que faltava em todos os clientes: `data.token` ausente virava
 * `localStorage.setItem(k, undefined)`, que o DOM converte para a string
 * `"undefined"` — truthy, e portanto "autenticado".
 */
const textoUtil = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

// ==========================================
// FÁBRICA
// ==========================================

export function createHubAuth(config: HubAuthConfig) {
    const base = config.baseUrl.replace(/\/+$/, '');
    const store = config.storage ?? storagePadrao();
    const TOKEN_KEY = config.tokenKey ?? 'awl_token';
    const USER_KEY = config.userKey ?? 'awl_user';
    const APP_KEY = config.appKey ?? 'awl_app';

    /** Renovação em voo, compartilhada por todos os chamadores. Ver `refresh`. */
    let refreshEmVoo: Promise<string | null> | null = null;

    async function chamar<T>(rota: string, opcoes: { body?: unknown; token?: string; metodo?: string } = {}): Promise<T> {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (textoUtil(opcoes.token)) headers.Authorization = `Bearer ${opcoes.token}`;

        let res: Response;
        try {
            res = await fetch(`${base}${rota}`, {
                method: opcoes.metodo ?? 'POST',
                headers,
                body: opcoes.body === undefined ? undefined : JSON.stringify(opcoes.body),
            });
        } catch {
            throw new HubApiError(0, 'REDE', 'Não foi possível falar com o servidor de login.');
        }

        const corpo = await res.json().catch(() => ({} as Record<string, unknown>));
        if (!res.ok) {
            const c = corpo as { error?: string; message?: string };
            throw new HubApiError(res.status, c.error ?? `HTTP_${res.status}`, c.message ?? 'Falha na autenticação.');
        }
        return corpo as T;
    }

    function salvarSessao(data: HubSessionData): void {
        // O token é o único campo obrigatório: `/auth/2fa/verify-setup` devolve
        // sessão sem `usuario`, e sobrescrever o que já está guardado com
        // `undefined` apagaria o perfil no meio do enrolamento.
        if (textoUtil(data.token)) store.set(TOKEN_KEY, data.token);
        if (data.usuario) store.set(USER_KEY, JSON.stringify(data.usuario));
        if (data.app) store.set(APP_KEY, JSON.stringify(data.app));
    }

    function limparSessao(): void {
        store.remove(TOKEN_KEY);
        store.remove(USER_KEY);
        store.remove(APP_KEY);
    }

    function getToken(): string | null {
        const t = store.get(TOKEN_KEY);
        // Blindagem contra o estado corrompido que os clientes antigos deixaram
        // gravado. Sem isto o app continua "logado" com lixo até alguém limpar
        // o storage à mão.
        return textoUtil(t) && t !== 'undefined' && t !== 'null' ? t : null;
    }

    function getUser(): HubUser | null {
        const bruto = store.get(USER_KEY);
        if (!textoUtil(bruto)) return null;
        try { return JSON.parse(bruto) as HubUser; } catch { return null; }
    }

    return {
        getToken,
        getUser,
        limparSessao,
        salvarSessao,

        /**
         * Primeira etapa. Devolve qual dos três desfechos ocorreu — e grava
         * sessão APENAS no desfecho `sessao`.
         *
         * O passe de enrolamento não é gravado como sessão de propósito: ele
         * abre só as rotas de 2FA, e guardá-lo em `TOKEN_KEY` faria o app se
         * considerar autenticado por 10 minutos com uma credencial que o resto
         * da API recusa.
         */
        async login(email: string, password: string): Promise<LoginResult> {
            const body: Record<string, unknown> = { email, password };
            if (config.appId !== undefined && config.appId !== null && config.appId !== '') {
                body.app_id = String(config.appId);
            }

            const data = await chamar<Record<string, unknown>>('/auth/login', { body });

            if (data.requires2FA === true && textoUtil(data.challengeToken)) {
                return {
                    status: 'desafio',
                    challengeToken: data.challengeToken,
                    expiresIn: Number(data.expiresIn ?? 300),
                    methods: (data.methods as MetodoSegundoFator[]) ?? ['totp', 'backup'],
                };
            }

            if (data.require2FASetup === true && textoUtil(data.setupToken)) {
                return {
                    status: 'enrolar',
                    setupToken: data.setupToken,
                    expiresIn: Number(data.expiresIn ?? 600),
                };
            }

            if (!textoUtil(data.token)) {
                throw new HubApiError(500, 'RESPOSTA_INESPERADA', 'O servidor de login devolveu uma resposta que este app não reconhece.');
            }

            const session = data as unknown as HubSessionData;
            salvarSessao(session);
            return { status: 'sessao', session };
        },

        /**
         * Define a senha a partir do magic link (convite ou reset).
         *
         * Mesmos três desfechos do login, pela mesma razão: numa conta que já
         * tem 2FA ativo o hub devolve desafio e NÃO sessão — senão o reset de
         * senha seria um atalho para pular o segundo fator, bastando controlar
         * a caixa de entrada.
         */
        async setupPassword(magicLinkToken: string, novaSenha: string): Promise<SetupPasswordResult> {
            const data = await chamar<Record<string, unknown>>('/auth/setup-password', {
                body: { token: magicLinkToken, novaSenha },
            });
            const message = String(data.message ?? 'Senha definida.');

            if (data.requires2FA === true && textoUtil(data.challengeToken)) {
                return {
                    status: 'desafio',
                    challengeToken: data.challengeToken,
                    expiresIn: Number(data.expiresIn ?? 300),
                    methods: (data.methods as MetodoSegundoFator[]) ?? ['totp', 'backup'],
                    message,
                };
            }

            if (data.require2FASetup === true && textoUtil(data.token)) {
                return { status: 'enrolar', setupToken: data.token, expiresIn: Number(data.expiresIn ?? 600), message };
            }

            if (!textoUtil(data.token)) {
                throw new HubApiError(500, 'RESPOSTA_INESPERADA', 'O servidor de login devolveu uma resposta que este app não reconhece.');
            }

            const session = { token: data.token, expiresIn: Number(data.expiresIn ?? 86400) } as HubSessionData;
            salvarSessao(session);
            return { status: 'sessao', session, message };
        },

        /**
         * Renova o JWT (aceita token recém-expirado, grace de 7 dias).
         *
         * **Single-flight**: chamadas concorrentes compartilham a MESMA
         * requisição em voo. É o caso normal num interceptor — várias
         * requisições caem em 401 juntas quando a sessão vence, e sem isso cada
         * uma dispararia um refresh, gastando N requisições para obter N tokens
         * dos quais só o último sobrevive no storage.
         *
         * O coordenador vive aqui, e não em cada app, justamente para o kit ser
         * a fonte única: antes eram três `performRefresh` + três
         * `refreshInFlight` copiados, cada um com a sua versão do que gravar.
         *
         * @param tokenExplicito para quem guarda a credencial fora do storage
         *        (interceptors que já têm o token em mãos). Se uma renovação já
         *        estiver em voo, ela é reaproveitada e este argumento é ignorado.
         * @returns o token novo, ou `null` — e aí quem chama deve deslogar.
         */
        refresh(tokenExplicito?: string): Promise<string | null> {
            if (refreshEmVoo) return refreshEmVoo;

            const atual = textoUtil(tokenExplicito) ? tokenExplicito : getToken();
            if (!atual) return Promise.resolve(null);

            refreshEmVoo = (async () => {
                try {
                    const data = await chamar<HubSessionData>('/auth/refresh', { token: atual });
                    if (!textoUtil(data.token)) return null;
                    // Sessão inteira, não só o token: o hub devolve `usuario` e
                    // `app` atualizados aqui, e é a única oportunidade de
                    // perceber, por exemplo, uma troca de role.
                    salvarSessao(data);
                    return data.token;
                } catch {
                    // Inclui SESSAO_REVOGADA (2FA ativado ou reset administrativo
                    // cortou as sessões anteriores). Não há o que renovar.
                    return null;
                } finally {
                    refreshEmVoo = null;
                }
            })();

            return refreshEmVoo;
        },

        logout(): void {
            limparSessao();
        },

        /**
         * Segunda etapa e enrolamento.
         *
         * `setup`, `verifySetup` e `status` aceitam o passe de enrolamento além
         * da sessão — quem chega nelas pode ainda não ter sessão, que é
         * justamente o que está indo configurar. Por isso recebem o token
         * explicitamente em vez de ler do storage.
         */
        twoFactor: {
            /** Fecha o login com o código do autenticador. Grava a sessão. */
            async verify(challengeToken: string, codigo: string): Promise<HubSessionData> {
                const data = await chamar<HubSessionData>('/auth/2fa/verify', { body: { challengeToken, codigo } });
                salvarSessao(data);
                return data;
            },

            /** Idem, com código de recuperação (uso único). */
            async verifyBackup(challengeToken: string, backupCode: string): Promise<HubSessionData> {
                const data = await chamar<HubSessionData>('/auth/2fa/verify-backup', { body: { challengeToken, backupCode } });
                salvarSessao(data);
                return data;
            },

            /** Passo 1 do enrolamento: secret + URI `otpauth://` para o QR. */
            async setup(token?: string): Promise<TwoFactorSetupData> {
                return chamar<TwoFactorSetupData>('/auth/2fa/setup', { body: {}, token: token ?? getToken() ?? undefined });
            },

            /**
             * Passo 2: confirma com um código.
             *
             * A ativação carimba o piso de sessão e mata o token que fez ESTA
             * chamada — inclusive o passe de enrolamento. Por isso a sessão nova
             * que vem na resposta é gravada aqui: sem isso a requisição seguinte
             * cai em `SESSAO_REVOGADA` e a pessoa é deslogada no exato momento
             * em que terminou o convite.
             *
             * Os `backupCodes` aparecem UMA vez só. Mostre antes de sair da tela.
             */
            async verifySetup(codigo: string, token?: string): Promise<TwoFactorActivation> {
                const data = await chamar<TwoFactorActivation>('/auth/2fa/verify-setup', {
                    body: { codigo },
                    token: token ?? getToken() ?? undefined,
                });
                if (textoUtil(data.token)) store.set(TOKEN_KEY, data.token);
                return data;
            },

            async status(token?: string): Promise<TwoFactorStatusData> {
                return chamar<TwoFactorStatusData>('/auth/2fa/status', {
                    metodo: 'GET',
                    token: token ?? getToken() ?? undefined,
                });
            },

            /**
             * Regenera os códigos de recuperação. Exige TOTP e invalida os anteriores.
             *
             * POST e não GET: na query string o código para em log de acesso e
             * histórico do navegador.
             */
            async regenerateBackupCodes(codigo: string): Promise<{ backupCodes: string[] }> {
                return chamar<{ backupCodes: string[] }>('/auth/2fa/backup-codes', {
                    body: { codigo },
                    token: getToken() ?? undefined,
                });
            },

            /**
             * Desativa o 2FA.
             *
             * Hoje devolve 403 OBRIGATORIO em TODA conta — o 2FA é exigido sem
             * exceção e não há rota que isente. Trocar de autenticador é ação
             * administrativa: `POST /admin/users/:id/reset-2fa`. Mantido aqui
             * porque a rota existe no hub, não porque haja caso de uso.
             */
            async disable(prova: { codigo?: string; backupCode?: string }): Promise<{ ativo: false }> {
                return chamar<{ ativo: false }>('/auth/2fa/disable', { body: prova, token: getToken() ?? undefined });
            },
        },
    };
}

export type HubAuth = ReturnType<typeof createHubAuth>;
