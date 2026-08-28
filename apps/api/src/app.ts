import express from 'express';
import helmet from 'helmet';
import { mainRouter as router } from './routes';
import { monitoringMiddleware, metricsEndpoint, corsMiddleware } from '@loginhub/middlewares';

const app = express();

// ==========================================
// 1. Middlewares Globais
// ==========================================
app.use(helmet());
app.use(corsMiddleware);
app.use(express.json({ limit: '5mb' }));

// Prometheus medir o tempo de TODAS as rotas abaixo
app.use(monitoringMiddleware as any);

// ==========================================
// 2. Rota de Métricas (Prometheus Scrape)
// ==========================================
app.get('/metrics', metricsEndpoint as any);

// ==========================================
// 3. Rota de Diagnóstico (Health Check)
// ==========================================
// Fica ANTES do `app.use('/api', router)` de propósito: é rota pública, sem
// authMiddleware. O painel consulta este endpoint de fundo para descobrir que
// saiu build novo, e quem está deslogado (justamente quem volta ao app depois
// de semanas) tomaria 401 se a checagem exigisse sessão.
app.get('/api', (req, res) => {
    const isDocker = process.env.DB_HOST === 'server_db_postgres';
    const hasMasterKey = !!(process.env.MASTER_KEY || process.env.MASTER_API_KEY);

    res.json({ 
        status: 'online',
        service: 'AWLSRV LoginHub', 
        // Versão do build, injetada pelo docker-compose a partir do arquivo
        // VERSION (ver scripts/bump-version.mjs). O 0.0.0 é o baseline neutro
        // que o front sabe ignorar quando a chave não chegou.
        version: process.env.APP_VERSION || '0.0.0',
        // Rebuild sem bump mantém a mesma versão e muda só a data — sem isto
        // um redeploy desses passaria despercebido pelo aviso.
        buildDate: process.env.APP_BUILD_DATE || null,
        environment: isDocker ? '🐳 Docker (Rede Cloudflare)' : '🍎 Mac / Local', 
        db_target: process.env.DB_HOST,
        monitoring: 'active 🟢',
        security: {
            master_key: hasMasterKey ? 'ATIVADA' : 'DESATIVADA'
        },
        timestamp: new Date().toISOString()
    });
});

// ==========================================
// 4. Demais Rotas
// ==========================================
app.use('/api', router);

export default app;