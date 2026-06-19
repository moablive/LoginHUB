import { Router } from 'express';
import { UserController } from '../../controllers/admin';

const router = Router();

router.get('/users', UserController.getAllUsers);

router.post('/users', UserController.addUser);

router.put('/users/:id', UserController.updateUser);

router.delete('/users/:id', UserController.removeUser);

router.get('/companies/:id/users', UserController.getUsersByCompany);

export default router;