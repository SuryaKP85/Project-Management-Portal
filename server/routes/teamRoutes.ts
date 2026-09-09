import { Router } from 'express';
import { TeamController } from '../controllers/teamController';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validation';

export const teamRoutes = Router();

teamRoutes.get('/teams', authenticateToken, TeamController.list);
teamRoutes.get('/teams/:id', authenticateToken, TeamController.getById);
teamRoutes.post(
  '/teams',
  authenticateToken,
  requireRoles(['admin', 'project-manager']),
  validateBody([
    { field: 'name', required: true, type: 'string' },
    { field: 'department', required: true, type: 'string' },
  ]),
  TeamController.create
);
teamRoutes.patch(
  '/teams/:id',
  authenticateToken,
  requireRoles(['admin', 'project-manager']),
  TeamController.update
);
teamRoutes.delete(
  '/teams/:id',
  authenticateToken,
  requireRoles(['admin']),
  TeamController.delete
);
teamRoutes.post(
  '/teams/:id/members',
  authenticateToken,
  requireRoles(['admin', 'project-manager']),
  TeamController.addMember
);
teamRoutes.delete(
  '/teams/:id/members/:userId',
  authenticateToken,
  requireRoles(['admin', 'project-manager']),
  TeamController.removeMember
);
