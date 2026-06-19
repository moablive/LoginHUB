import { Router } from 'express';
import { CompanyController } from '../../controllers/admin';

const router = Router();

router.get('/companies', CompanyController.getAllCompanies); 

router.get('/companies/:id', CompanyController.getById);

router.post('/companies', CompanyController.createCompany);

router.put('/companies/:id', CompanyController.updateCompany);

router.patch('/companies/:id/status', CompanyController.toggleCompanyStatus);

router.delete('/companies/:id', CompanyController.deleteCompany);

export default router;