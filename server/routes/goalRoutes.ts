import { Router } from 'express';
import { GoalController } from '../controllers/goalController';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validation';

export const goalRoutes = Router();

goalRoutes.get('/goals', authenticateToken, GoalController.list);
goalRoutes.get('/goals/:id', authenticateToken, GoalController.getById);
goalRoutes.post(
  '/goals',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager']),
  validateBody([
    { field: 'objective', required: true, type: 'string' },
  ]),
  GoalController.create
);
goalRoutes.patch(
  '/goals/:id',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager']),
  GoalController.update
);
goalRoutes.delete(
  '/goals/:id',
  authenticateToken,
  requireRoles(['admin']),
  GoalController.delete
);
