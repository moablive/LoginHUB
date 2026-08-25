/**
 * Guarda de sessão do LoginHUB para as APIs dos apps clientes.
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ ARQUIVO SINCRONIZADO — não edite a cópia dentro de um app cliente.     │
 * │ Fonte: LoginHUB/packages/auth-kit/src/hubAuthServer.ts                 │
 * │ Propague com: LoginHUB/scripts/sync-auth-kit.sh                        │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * POR QUE ISTO EXISTE
 *
 * Todo app cliente valida o JWT do hub com o MESMO `JWT_SECRET`. Isso é o que
 * permite a identidade central funcionar — e é também o que torna cada app
 * responsável por recusar os tokens que NÃO são sessão.
 *
 * O hub emite três passes de etapa única, todos assinados com esse segredo:
 *
 *   action: '2fa-challenge'   5 min   obtido com a SENHA apenas
 *   action: '2fa-setup'      10 min   obtido com a SENHA apenas
 *   action: 'setup-password' 24 h     obtido com o E-MAIL de convite apenas
 *
 * Os três passam por `jwt.verify` sem reclamar. Um `verify` cru, portanto,
 * aceita como sessão exatamente as credenciais que o segundo fator deveria
 * barrar: o `2fa-setup` carrega `sub`, `email`, `app_id` e `role`, e é
 * indistinguível de uma sessão real para quem só confere a assinatura.
 *
 * O hub recusa esses tokens nas próprias rotas. Esta guarda leva a mesma regra
 * para o outro lado da fronteira.
 */

import jwt from 'jsonwebtoken';

/** Payload de uma sessão legítima emitida pelo LoginHUB. */
export interface HubSession {
    /** ID do usuário no LoginHUB. */
    sub: string;
    email?: string;
    app_id?: string | number;
    role?: string;
    iat?: number;
    exp?: number;
}

/** Erro com status HTTP e código estável — a mensagem pode mudar, o código não. */
export class HubAuthError extends Error {
    // Campos declarados e atribuidos no corpo, e nao como parameter properties:
    // `erasableSyntaxOnly`, ligado em parte dos apps, recusa essa sintaxe. Este
    // arquivo e copiado para todos eles, entao vale o denominador comum.
    readonly status: number;
    readonly code: string;

    constructor(status: number, code: string, message: string) {
        super(message);
        this.name = 'HubAuthError';
        this.status = status;
        this.code = code;
    }
}

export interface HubGuardConfig {
    /** `JWT_SECRET`, o mesmo do LoginHUB. */
    secret: string | undefined;
    /** ID deste app no hub. Token de outro tenant é recusado. */
    appId: string | number | undefined;
    /**
     * Aceita também `app_id: "0"` — a sessão master do hub.
     *
     * Só ligue onde o painel master precisa mesmo entrar no app. Master não tem
     * linha em `usuarios`, então não passa por 2FA nenhum.
     */
    allowMaster?: boolean;
}

const MASTER_APP_ID = '0';

/**
 * Valida um token do LoginHUB e devolve a sessão.
 *
 * Lança `HubAuthError` em qualquer desvio — quem chama decide como responder.
 */
export function verifyHubToken(token: string, config: HubGuardConfig): HubSession {
    // Falha fechada nas duas configurações. Um segredo ausente com fallback para
    // constante conhecida (`process.env.JWT_SECRET || 'secret'`) aceita token
    // forjado por qualquer um que leia o código; um appId ausente desliga a
    // checagem de tenant sem ninguém perceber.
    if (!config.secret) {
        throw new HubAuthError(500, 'CONFIG_AUSENTE', 'JWT_SECRET não configurado neste serviço.');
    }
    if (config.appId === undefined || config.appId === null || config.appId === '') {
        throw new HubAuthError(500, 'CONFIG_AUSENTE', 'APP_ID do LoginHUB não configurado neste serviço.');
    }

    let payload: HubSession & { action?: string };
    try {
        payload = jwt.verify(token, config.secret) as HubSession & { action?: string };
    } catch (err) {
        const expirado = (err as Error)?.name === 'TokenExpiredError';
        throw new HubAuthError(
            401,
            expirado ? 'TOKEN_EXPIRADO' : 'TOKEN_INVALIDO',
            expirado ? 'Sessão expirada. Faça login novamente.' : 'Token inválido.',
        );
    }

    // O ponto do arquivo. Todo token com `action` é passe de UMA etapa do login,
    // nunca sessão: aceitá-lo aqui devolve ao portador exatamente o acesso que a
    // etapa seguinte deveria exigir.
    if (payload.action) {
        throw new HubAuthError(
            401,
            'TOKEN_NAO_E_SESSAO',
            'Este token serve a uma etapa do login, não à sessão. Conclua o login.',
        );
    }

    if (!payload.sub) {
        throw new HubAuthError(401, 'TOKEN_INVALIDO', 'Token sem identificação de usuário.');
    }

    const doToken = payload.app_id === undefined || payload.app_id === null
        ? null
        : String(payload.app_id);
    const esperado = String(config.appId);
    const master = config.allowMaster === true && doToken === MASTER_APP_ID;

    if (doToken !== esperado && !master) {
        throw new HubAuthError(403, 'TENANT_INVALIDO', 'Este acesso não pertence a este sistema.');
    }

    return payload;
}

/** Só o formato que a guarda usa — evita depender dos tipos do express. */
interface ReqLike {
    headers: Record<string, string | string[] | undefined>;
}
interface ResLike {
    status(code: number): { json(body: unknown): unknown };
}

/** Extrai o Bearer do header. `null` se ausente ou malformado. */
export function bearerDoRequest(req: ReqLike): string | null {
    const bruto = req.headers?.authorization;
    const header = Array.isArray(bruto) ? bruto[0] : bruto;
    if (!header || !header.startsWith('Bearer ')) return null;

    const token = header.slice('Bearer '.length).trim();
    return token || null;
}

/**
 * Middleware express que valida o token e anexa a sessão em `req.hubSession`.
 *
 * Deliberadamente NÃO grava em `req.user`: cada app já tem o seu formato ali
 * (`{ loginhubId, email }` no MoneyAPP, o payload cru no LBSTTSAPP...), e
 * sobrescrever isso quebraria o resto do backend. Monte o seu `req.user` a
 * partir de `req.hubSession`.
 */
export function createHubGuard(config: HubGuardConfig) {
    return function hubGuard(req: ReqLike, res: ResLike, next: (err?: unknown) => void): unknown {
        const token = bearerDoRequest(req);
        if (!token) {
            return res.status(401).json({ error: 'TOKEN_AUSENTE', message: 'Token não fornecido.' });
        }

        try {
            (req as ReqLike & { hubSession?: HubSession }).hubSession = verifyHubToken(token, config);
            return next();
        } catch (err) {
            const e = err as HubAuthError;
            if (e instanceof HubAuthError) {
                return res.status(e.status).json({ error: e.code, message: e.message });
            }
            return res.status(401).json({ error: 'TOKEN_INVALIDO', message: 'Token inválido.' });
        }
    };
}

/**
 * LIMITAÇÃO CONHECIDA — revogação de sessão.
 *
 * Ativar o 2FA (e o reset administrativo) carimba `usuarios_2fa.sessoes_validas_desde`
 * no hub, e o hub passa a recusar JWT com `iat` anterior a esse piso. Um app
 * cliente não tem como enxergar isso: a informação está no banco do hub e não
 * há rota de introspecção.
 *
 * Consequência: um token emitido antes do corte continua valendo aqui até
 * expirar (24 h no máximo, sem renovação — o `/auth/refresh` do hub recusa).
 * Fechar isso exige uma rota de introspecção no hub; até lá, a janela é essa.
 */
