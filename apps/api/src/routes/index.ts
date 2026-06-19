// src/routes/index.ts
import { Router, Request, Response } from 'express';
import authRoutes from './auth.routes'; 
import adminRoutes from './admin.routes';

const router = Router();

// --- Detecção de Ambiente ---
const isDocker = process.env.IS_DOCKER === 'true';

// --- Health Check (Para monitoramento) ---
router.get('/', (req: Request, res: Response) => {
    res.status(200).json({
        status: 'online',
        service: 'AWLSRV LoginHub',
        version: '1.0.0',
        environment: isDocker ? '🐳 Docker (Rede Interna)' : '🍎 Mac (Acesso Remoto)', 
        db_target: process.env.DB_HOST || (isDocker ? 'awlsrvDB_postgres' : 'DuckDNS/Local'),
        message: '🚀 Sistema operante e protegido.',
        timestamp: new Date().toISOString()
    });
});

// --- Definição das Rotas ---

// 1. Rotas Públicas (Login)
router.use('/auth', authRoutes);

// 2. Rotas Administrativas (Protegidas por Master Key)
// O 'adminRoutes' já inclui internamente as rotas de companies e users
// Ex: GET /api/admin/companies, GET /api/admin/users
router.use('/admin', adminRoutes);

export default router;