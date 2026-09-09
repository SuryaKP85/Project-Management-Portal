import { Router } from 'express';
import { BacklogController } from '../controllers/backlogController';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';

export const backlogRoutes = Router();

backlogRoutes.get('/backlog', authenticateToken, BacklogController.getBacklog);

backlogRoutes.put(
  '/backlog/reorder',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager', 'team-member']),
  BacklogController.reorder
);

backlogRoutes.post(
  '/backlog/assign',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager', 'team-member']),
  BacklogController.assign
);
