import { Router } from 'express';
import { MilestoneController } from '../controllers/milestoneController';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';

export const milestoneRoutes = Router();

milestoneRoutes.get('/milestones', authenticateToken, MilestoneController.listMilestones);
milestoneRoutes.get('/milestones/:id', authenticateToken, MilestoneController.getMilestone);
milestoneRoutes.post(
  '/milestones',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager']),
  MilestoneController.createMilestone
);
milestoneRoutes.put(
  '/milestones/:id',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager']),
  MilestoneController.updateMilestone
);
milestoneRoutes.delete(
  '/milestones/:id',
  authenticateToken,
  requireRoles(['admin', 'project-manager']),
  MilestoneController.deleteMilestone
);
milestoneRoutes.post(
  '/milestones/:id/links',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager']),
  MilestoneController.linkItem
);
milestoneRoutes.delete(
  '/milestones/:id/links/:linkId',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager']),
  MilestoneController.unlinkItem
);
