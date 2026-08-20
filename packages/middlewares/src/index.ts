import { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '@loginhub/database';
import { aplicativos, usuarios2fa, JWTPayload } from '@loginhub/schema';
import { eq } from 'drizzle-orm';
import cors, { CorsOptions } from 'cors';
import client from 'prom-client';

// ==========================================
// 1. ADMIN MIDDLEWARE
// ==========================================
export const adminMiddleware: RequestHandler = (req, res, next) => {
    const validKey = process.env.MASTER_API_KEY;

    // Fail-safe: Bloqueia se a configuração do servidor estiver incorreta
    if (!validKey) {
        console.error('❌ FATAL: MASTER_API_KEY ausente no .env');
        return res.status(500).json({ error: 'Erro de configuração do servidor.' });
    }

    const headerValue = req.headers['x-api-key'];
    
    // Normaliza caso o header venha como array de strings
    const apiKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!apiKey || apiKey !== validKey) {
        console.warn(`[AdminAuth] Acesso negado. IP: ${req.ip}`);
        return res.status(403).json({ 
            error: 'Acesso Proibido',
            message: 'Credencial mestre inválida ou ausente.' 
        });
    }

    return next();
};

// ==========================================
// 2. AUTH MIDDLEWARE
// ==========================================
export const authMiddleware: RequestHandler = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'Token não fornecido.' });
    }

    const parts = authHeader.split(' ');
    
    // Verifica se tem 2 partes E se a segunda parte existe (pra calar o TypeScript)
    if (parts.length !== 2 || !parts[1]) {
        return res.status(401).json({ error: 'Formato de token inválido.' });
    }
    
    // 'as string' garante que o token é string (resolve o erro no 1º argumento)
    const token = parts[1] as string;
    
    // Fallback para garantir string (resolve o erro no 2º argumento)
    const secretKey = process.env.JWT_SECRET || '';

    if (!secretKey) {
        console.error("❌ FATAL: JWT_SECRET não configurado no .env");
        return res.status(500).json({ error: 'Erro interno de configuração.' });
    }

    try {
        // Agora ambos são strings garantidas
        const decoded = jwt.verify(token, secretKey) as unknown as JWTPayload;

        // As duas checagens são independentes — uma ida só ao banco.
        const [appRows, doisFatoresRows] = await Promise.all([
            db.select({ status: aplicativos.status })
              .from(aplicativos)
              .where(eq(aplicativos.id, Number(decoded.app_id))),
            db.select({ sessoesValidasDesde: usuarios2fa.sessoesValidasDesde })
              .from(usuarios2fa)
              .where(eq(usuarios2fa.usuarioId, Number(decoded.sub)))
              .limit(1),
        ]);

        const app = appRows[0];

        if (!app) {
            return res.status(401).json({ error: 'Aplicativo vinculada não encontrada.' });
        }

        if (app.status !== 'ativo') {
            return res.status(403).json({ 
                error: 'Acesso Bloqueado',
                message: 'O acesso da sua organização foi suspenso.' 
            });
        }

        // Piso de sessão: ativar 2FA carimba um instante a partir do qual só
        // valem tokens novos. Sem isto, um JWT emitido antes da ativação seguiria
        // válido por 24h — e renovável por mais 7 dias pelo grace do /auth/refresh.
        const piso = doisFatoresRows[0]?.sessoesValidasDesde;
        if (piso && decoded.iat && decoded.iat * 1000 < piso.getTime()) {
            return res.status(401).json({
                error: 'SESSAO_REVOGADA',
                message: 'Sessão encerrada por alteração de segurança. Faça login novamente.',
            });
        }

        (req as any).user = {
            ...decoded
        };
        
        return next();

    } catch (err) {
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
};

// ==========================================
// 3. RATE LIMIT
// ==========================================
/**
 * Limitador em memória, por processo.
 *
 * A stack roda um container de API só, então um Map resolve. Duas consequências
 * assumidas: o contador zera a cada restart (e o `ts-node-dev --respawn` faz
 * isso a cada save em dev), e ele não serve para escalar horizontalmente — se
 * um dia houver réplica, isto vira Redis.
 *
 * A chave NUNCA é só o IP nas rotas de 2FA: as APIs dos tenants falam com o hub
 * pela rede interna e chegam todas pelo mesmo gateway. Limitar por IP puro
 * trataria todos os apps como um cliente só.
 */
interface Balde { contador: number; expiraEm: number; }
const baldes = new Map<string, Balde>();

const varrerExpirados = (agora: number): void => {
    for (const [k, v] of baldes) if (v.expiraEm <= agora) baldes.delete(k);
};

export interface RateLimitOpcoes {
    /** Prefixo do balde — separa as contagens de rotas diferentes. */
    nome: string;
    janelaMs: number;
    max: number;
    /** Identidade a limitar. Padrão: IP. */
    chave?: (req: Parameters<RequestHandler>[0]) => string;
}

export const criarRateLimit = (opcoes: RateLimitOpcoes): RequestHandler => {
    const { nome, janelaMs, max, chave } = opcoes;

    return (req, res, next) => {
        const agora = Date.now();
        if (baldes.size > 1000) varrerExpirados(agora);

        const id = `${nome}:${chave ? chave(req) : (req.ip || 'sem-ip')}`;
        const balde = baldes.get(id);

        if (!balde || balde.expiraEm <= agora) {
            baldes.set(id, { contador: 1, expiraEm: agora + janelaMs });
            return next();
        }

        balde.contador += 1;
        if (balde.contador > max) {
            const retryApos = Math.ceil((balde.expiraEm - agora) / 1000);
            res.setHeader('Retry-After', String(retryApos));
            return res.status(429).json({
                error: 'MUITAS_TENTATIVAS',
                message: `Limite de tentativas excedido. Tente novamente em ${retryApos}s.`,
            });
        }

        return next();
    };
};

/**
 * Chave derivada do `sub` do token de desafio (corpo `challengeToken`), com o
 * IP como reserva. Assim o limite é por CONTA em disputa, e não por origem —
 * que é o que importa contra força bruta de 6 dígitos.
 */
export const chaveDoChallenge = (req: any): string => {
    const bruto = req.body?.challengeToken;
    if (typeof bruto === 'string') {
        try {
            const payload = JSON.parse(
                Buffer.from(bruto.split('.')[1] ?? '', 'base64').toString('utf8'),
            );
            if (payload?.sub) return `u${payload.sub}`;
        } catch {
            // token ilegível: cai no IP
        }
    }
    return req.ip || 'sem-ip';
};

/** Chave para rotas já autenticadas: o usuário do JWT. */
export const chaveDoUsuario = (req: any): string =>
    req.user?.sub ? `u${req.user.sub}` : (req.ip || 'sem-ip');

/**
 * 6 dígitos = 1 milhão de combinações. Com 5 tentativas por 15 min por conta, a
 * chance de acerto por força bruta em 24h fica na ordem de 1 em 2 mil.
 */
export const rateLimitVerificacao2FA = criarRateLimit({
    nome: '2fa-verify',
    janelaMs: 15 * 60 * 1000,
    max: 5,
    chave: chaveDoChallenge,
});

/** Rotas de gestão (setup, disable, backup codes) — já exigem sessão válida. */
export const rateLimitGestao2FA = criarRateLimit({
    nome: '2fa-gestao',
    janelaMs: 15 * 60 * 1000,
    max: 10,
    chave: chaveDoUsuario,
});

// ==========================================
// 4. CORS MIDDLEWARE
// ==========================================
// Aceita qualquer subdomínio de astralwavelabel.com automaticamente.
// Novos apps em *.astralwavelabel.com não precisam ser adicionados manualmente.
const ASTRALWAVE_ORIGIN_RE = /^https:\/\/([\w-]+\.)*astralwavelabel\.com$/;

/**
 * Origens permitidas fora de astralwavelabel.com, via `CORS_EXTRA_ORIGINS`.
 *
 * Nem todo app cliente mora num subdomínio nosso: a Sul Alimentos serve o painel
 * em app.sulalimentos.com e o login dela batia em preflight bloqueado, porque a
 * regex acima só cobre a nossa zona.
 *
 * Aceita a origem exata (`https://app.exemplo.com`) ou a curinga de domínio
 * (`*.exemplo.com`, que cobre o apex e os subdomínios). Só https — em texto
 * claro nenhum painel deveria estar falando com o hub.
 */
const origensExtras = (): string[] =>
    (process.env.CORS_EXTRA_ORIGINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

const casaComPadrao = (origin: string, padrao: string): boolean => {
    if (padrao === origin) return true;
    if (!padrao.startsWith('*.')) return false;

    const base = padrao.slice(2);
    try {
        const url = new URL(origin);
        if (url.protocol !== 'https:') return false;
        return url.hostname === base || url.hostname.endsWith(`.${base}`);
    } catch {
        return false;
    }
};

const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
        // 1. Permitir requisições sem 'origin' (Postman, cURL, Server-to-Server)
        if (!origin) {
            return callback(null, true);
        }

        // 2. Permitir Localhost (Desenvolvimento)
        if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
            return callback(null, true);
        }

        // 3. Permitir qualquer *.astralwavelabel.com (Produção)
        if (ASTRALWAVE_ORIGIN_RE.test(origin)) {
            return callback(null, true);
        }

        // 4. Permitir as origens declaradas em CORS_EXTRA_ORIGINS
        if (origensExtras().some((padrao) => casaComPadrao(origin, padrao))) {
            return callback(null, true);
        }

        // 5. Bloquear resto
        console.warn(`[CORS] Origem recusada: ${origin}`);
        return callback(new Error('Bloqueado por CORS: Origem não permitida.'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    
    allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'x-api-key',
        'x-master-key'
    ], 
    
    credentials: true,
    optionsSuccessStatus: 200
};

export const corsMiddleware = cors(corsOptions);

// ==========================================
// 5. MONITORING MIDDLEWARE
// ==========================================
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP em segundos',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const monitoringMiddleware: RequestHandler = (req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.route.path : req.path;
    end({
      method: req.method,
      route: route,
      status_code: res.statusCode.toString(),
    });
  });
  next();
};

export const metricsEndpoint: RequestHandler = async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
};
