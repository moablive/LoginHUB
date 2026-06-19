import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import router from './routes';
import { monitoringMiddleware, metricsEndpoint } from './middlewares/monitoring';

const app = express();

// ==========================================
// 1. Middlewares Globais
// ==========================================
app.use(helmet());       
app.use(cors());         
app.use(express.json()); 

// Prometheus medir o tempo de TODAS as rotas abaixo
app.use(monitoringMiddleware);

// ==========================================
// 2. Rota de Métricas (Prometheus Scrape)
// ==========================================
app.get('/metrics', metricsEndpoint);

// ==========================================
// 3. Rota de Diagnóstico (Health Check)
// ==========================================
app.get('/api', (req, res) => {
    const isDocker = process.env.DB_HOST === 'awlsrvDB_postgres';
    const hasMasterKey = !!(process.env.MASTER_KEY || process.env.MASTER_API_KEY);

    res.json({ 
        status: 'online',
        service: 'AWLSRV LoginHub', 
        version: '1.0.0',
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