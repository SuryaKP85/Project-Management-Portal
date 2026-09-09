import { Router } from 'express';
import { GovernanceController } from '../controllers/governanceController';
import { authenticateToken } from '../middleware/authMiddleware';

export const governanceRoutes = Router();

governanceRoutes.get('/governance/summary', authenticateToken, GovernanceController.getSummary);
governanceRoutes.get('/governance/traceability/:entityType/:id', authenticateToken, GovernanceController.getTraceability);
