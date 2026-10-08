import { Router } from 'express';
import { HealthController } from '../controllers/healthController';

export const healthRoutes = Router();
healthRoutes.get('/health', HealthController.status);
// Sprint 24: liveness (process up), separate from /health readiness (database answering in PostgreSQL mode).
healthRoutes.get('/health/live', HealthController.live);
