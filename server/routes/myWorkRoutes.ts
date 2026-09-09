import { Router } from 'express';
import { MyWorkController } from '../controllers/myWorkController';
import { authenticateToken } from '../middleware/authMiddleware';

export const myWorkRoutes = Router();

myWorkRoutes.get('/my-work', authenticateToken, MyWorkController.getMyWork);
myWorkRoutes.post('/my-work/status', authenticateToken, MyWorkController.updateItemStatus);
