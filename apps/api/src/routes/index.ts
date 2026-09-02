import { Router } from 'express';
import {
  AuthController,
  AppController,
  UserController,
  TwoFactorController
} from '../controllers';
import {
  adminMiddleware,
  delegationMiddleware,
  authMiddleware,
  authMiddlewareEnrolamento,
  rateLimitLogin,
  rateLimitVerificacao2FA,
  rateLimitGestao2FA,
  rateLimitStatus2FA
} from '@loginhub/middlewares';

export const mainRouter = Router();

// ==========================================
// 1. Auth Routes
// ==========================================
const authRouter = Router();
authRouter.post('/login', rateLimitLogin as any, AuthController.login);
authRouter.post('/logout', AuthController.logout);
authRouter.post('/refresh', AuthController.refresh);
// Introspeccao de revogacao: o app cliente valida assinatura/action/tenant
// localmente, mas nao enxerga o piso de sessao (mora no banco do hub). GET
// porque e leitura pura e cacheavel; autentica com o proprio token, entao
// ninguem varre o piso de terceiros.
authRouter.get('/session-floor', AuthController.pisoDeSessao);
// /change-password saiu de novo: como alias de `setupPassword` ele só produzia
// 400 (o cliente antigo manda `Authorization` + `{ novaSenha }`, e aqui se exige
// `{ token, novaSenha }`). Senha se define pelo magic link, e ponto.
authRouter.post('/setup-password', AuthController.setupPassword as any);
// Fase 2: sessao delegada. O servico (bot) apresenta HUB_DELEGATION_KEY via
// x-service-key e recebe um JWT de usuario curto para repassar ao app, no
// lugar do x-user-id confiado cego. Desligada se a chave nao estiver setada.
authRouter.post('/service/delegate', delegationMiddleware as any, AuthController.delegate as any);

// -- 2FA (TOTP)
//
// Três famílias com proteções diferentes:
//
//   verify / verify-backup  → públicas. A credencial é o `challengeToken` que o
//        login acabou de emitir. Rate limit por CONTA (o `sub` do desafio), não
//        por IP: seis dígitos são 1 milhão de combinações e o atacante pode
//        trocar de origem, mas não de alvo.
//
//   status / setup / verify-setup → enrolamento. Quem chega aqui pode ainda não
//        ter sessão — é justamente o que está indo configurar —, então aceitam
//        também o passe `2fa-setup` de 10 minutos.
//
//   disable / backup-codes → exigem sessão de verdade. Desativar o segundo
//        fator ou trocar os códigos de recuperação são ações de conta aberta;
//        um passe de etapa única não serve, e o `authMiddleware` agora recusa.
const twoFactorRouter = Router();

twoFactorRouter.post('/verify', rateLimitVerificacao2FA as any, TwoFactorController.verify as any);
twoFactorRouter.post('/verify-backup', rateLimitVerificacao2FA as any, TwoFactorController.verifyBackup as any);

const enrolamento = [authMiddlewareEnrolamento as any, rateLimitGestao2FA as any];
// `status` é leitura e sai do balde estreito: a tela de enrolamento consulta a
// cada carregamento, e no celular recarregar é rotina. Ver rateLimitStatus2FA.
twoFactorRouter.get('/status', authMiddlewareEnrolamento as any, rateLimitStatus2FA as any, TwoFactorController.status as any);
twoFactorRouter.post('/setup', ...enrolamento, TwoFactorController.setup as any);
twoFactorRouter.post('/verify-setup', ...enrolamento, TwoFactorController.verifySetup as any);

const gestao = [authMiddleware as any, rateLimitGestao2FA as any];
twoFactorRouter.post('/disable', ...gestao, TwoFactorController.disable as any);
// GET foi o especificado; o POST evita o código na query string. Mesmo handler.
twoFactorRouter.get('/backup-codes', ...gestao, TwoFactorController.backupCodes as any);
twoFactorRouter.post('/backup-codes', ...gestao, TwoFactorController.backupCodes as any);

authRouter.use('/2fa', twoFactorRouter);

mainRouter.use('/auth', authRouter);

// ==========================================
// 2. Admin Routes (Protected)
// ==========================================
const adminRouter = Router();
adminRouter.use(adminMiddleware as any);

// -- Apps
adminRouter.get('/apps', AppController.getAllApps as any); 
adminRouter.get('/apps/:id', AppController.getById as any);
adminRouter.post('/apps', AppController.createApp as any);
adminRouter.put('/apps/:id', AppController.updateApp as any);
adminRouter.patch('/apps/:id/status', AppController.toggleAppStatus as any);
adminRouter.delete('/apps/:id', AppController.deleteApp as any);

// -- Users (nested in apps or standalone)
adminRouter.get('/apps/:id/users', UserController.getUsersByApp as any);

adminRouter.get('/users', UserController.getAllUsers as any);
adminRouter.post('/users', UserController.addUser as any);
adminRouter.put('/users/:id', UserController.updateUser as any);
adminRouter.patch('/users/:id/status', UserController.toggleUserStatus as any);
adminRouter.post('/users/:id/reset-password', UserController.resetPassword as any);
// Perdeu o celular E os códigos de recuperação: sem isto a conta ficava morta,
// porque /auth/2fa/disable recusa desativar um 2FA obrigatório.
adminRouter.post('/users/:id/reset-2fa', UserController.resetTwoFactor as any);
adminRouter.delete('/users/:id', UserController.removeUser as any);

mainRouter.use('/admin', adminRouter);
