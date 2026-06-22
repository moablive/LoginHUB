import { Router } from 'express';
import {
  AuthController,
  AppController,
  UserController
} from '../controllers';
import { adminMiddleware, authMiddleware } from '@loginhub/middlewares';

export const mainRouter = Router();

// ==========================================
// 1. Auth Routes
// ==========================================
const authRouter = Router();
authRouter.post('/login', AuthController.login);
authRouter.post('/logout', AuthController.logout);
authRouter.post('/refresh', AuthController.refresh);
authRouter.post('/change-password', authMiddleware as any, AuthController.changePassword as any);

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
adminRouter.post('/users/:id/reset-password', UserController.resetPassword as any);
adminRouter.delete('/users/:id', UserController.removeUser as any);

mainRouter.use('/admin', adminRouter);
