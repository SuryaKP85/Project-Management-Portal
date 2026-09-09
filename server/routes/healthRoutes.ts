import { Router } from 'express';
import { HealthController } from '../controllers/healthController';

export const healthRoutes = Router();
healthRoutes.get('/health', HealthController.status);
