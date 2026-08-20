import { Router } from 'express';
import {
  AuthController,
  AppController,
  UserController,
  TwoFactorController
} from '../controllers';
import {
  adminMiddleware,
  authMiddleware,
  rateLimitVerificacao2FA,
  rateLimitGestao2FA
} from '@loginhub/middlewares';

export const mainRouter = Router();

// ==========================================
// 1. Auth Routes
// ==========================================
const authRouter = Router();
authRouter.post('/login', AuthController.login);
authRouter.post('/logout', AuthController.logout);
authRouter.post('/refresh', AuthController.refresh);
authRouter.post('/change-password', AuthController.setupPassword as any);
authRouter.post('/setup-password', AuthController.setupPassword as any);

// -- 2FA (TOTP)
//
// Duas famílias com proteções diferentes:
//
//   verify / verify-backup  → públicas. A credencial é o `challengeToken` que o
//        login acabou de emitir. Rate limit por CONTA (o `sub` do desafio), não
//        por IP: seis dígitos são 1 milhão de combinações e o atacante pode
//        trocar de origem, mas não de alvo.
//
//   setup / verify-setup / disable / backup-codes → exigem sessão. São o
//        primeiro uso real do `authMiddleware` neste app, e é lá que mora a
//        checagem do piso de sessão.
const twoFactorRouter = Router();

twoFactorRouter.post('/verify', rateLimitVerificacao2FA as any, TwoFactorController.verify as any);
twoFactorRouter.post('/verify-backup', rateLimitVerificacao2FA as any, TwoFactorController.verifyBackup as any);

twoFactorRouter.use(authMiddleware as any);
twoFactorRouter.use(rateLimitGestao2FA as any);

twoFactorRouter.get('/status', TwoFactorController.status as any);
twoFactorRouter.post('/setup', TwoFactorController.setup as any);
twoFactorRouter.post('/verify-setup', TwoFactorController.verifySetup as any);
twoFactorRouter.post('/disable', TwoFactorController.disable as any);
// GET foi o especificado; o POST evita o código na query string. Mesmo handler.
twoFactorRouter.get('/backup-codes', TwoFactorController.backupCodes as any);
twoFactorRouter.post('/backup-codes', TwoFactorController.backupCodes as any);

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
adminRouter.delete('/users/:id', UserController.removeUser as any);

mainRouter.use('/admin', adminRouter);
