import { Router } from 'express';
import { VelocityController } from '../controllers/velocityController';
import { authenticateToken } from '../middleware/authMiddleware';

export const velocityRoutes = Router();

velocityRoutes.get('/velocity', authenticateToken, VelocityController.getVelocity);
