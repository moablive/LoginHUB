import { Router } from 'express';
import { adminMiddleware } from '../middlewares/adminMiddleware';

// Importa os roteadores separados
import companyRoutes from './admin/company.routes';
import userRoutes from './admin/user.routes';

const router = Router();

// =============================================================
// SEGURANÇA (MASTER KEY)
// =============================================================
// Aplica o middleware para TODAS as rotas abaixo deste ponto
router.use(adminMiddleware);

// =============================================================
// AGRUPAMENTO DE ROTAS
// =============================================================

// Injeta as rotas de Empresas
router.use(companyRoutes);

// Injeta as rotas de Usuários
router.use(userRoutes);

export default router;