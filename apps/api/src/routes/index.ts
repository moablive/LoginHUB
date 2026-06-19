import { Router } from 'express';
import {
  AuthController,
  CompanyController,
  UserController
} from '../controllers';
import { adminMiddleware } from '@loginhub/middlewares';

export const mainRouter = Router();

// ==========================================
// 1. Auth Routes
// ==========================================
const authRouter = Router();
authRouter.post('/login', AuthController.login);
authRouter.post('/logout', AuthController.logout);

mainRouter.use('/auth', authRouter);

// ==========================================
// 2. Admin Routes (Protected)
// ==========================================
const adminRouter = Router();
adminRouter.use(adminMiddleware as any);

// -- Companies
adminRouter.get('/companies', CompanyController.getAllCompanies as any); 
adminRouter.get('/companies/:id', CompanyController.getById as any);
adminRouter.post('/companies', CompanyController.createCompany as any);
adminRouter.put('/companies/:id', CompanyController.updateCompany as any);
adminRouter.patch('/companies/:id/status', CompanyController.toggleCompanyStatus as any);
adminRouter.delete('/companies/:id', CompanyController.deleteCompany as any);

// -- Users (nested in companies or standalone)
adminRouter.get('/companies/:id/users', UserController.getUsersByCompany as any);

adminRouter.get('/users', UserController.getAllUsers as any);
adminRouter.post('/users', UserController.addUser as any);
adminRouter.put('/users/:id', UserController.updateUser as any);
adminRouter.delete('/users/:id', UserController.removeUser as any);

mainRouter.use('/admin', adminRouter);
