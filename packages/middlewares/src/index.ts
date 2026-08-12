import { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '@loginhub/database';
import { aplicativos, JWTPayload } from '@loginhub/schema';
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

        const result = await db.select({ status: aplicativos.status }).from(aplicativos).where(eq(aplicativos.id, Number(decoded.app_id)));

        const app = result[0];

        if (!app) {
            return res.status(401).json({ error: 'Aplicativo vinculada não encontrada.' });
        }

        if (app.status !== 'ativo') {
            return res.status(403).json({ 
                error: 'Acesso Bloqueado',
                message: 'O acesso da sua organização foi suspenso.' 
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
// 3. CORS MIDDLEWARE
// ==========================================
// Aceita qualquer subdomínio de astralwavelabel.com automaticamente.
// Novos apps em *.astralwavelabel.com não precisam ser adicionados manualmente.
const ASTRALWAVE_ORIGIN_RE = /^https:\/\/([\w-]+\.)*astralwavelabel\.com$/;

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

        // 4. Bloquear resto
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
// 4. MONITORING MIDDLEWARE
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
