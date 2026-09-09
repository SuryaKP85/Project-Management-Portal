import { Router } from 'express';
import { ActivityController } from '../controllers/activityController';
import { authenticateToken } from '../middleware/authMiddleware';

export const activityRoutes = Router();

activityRoutes.get('/activity', authenticateToken, ActivityController.list);
