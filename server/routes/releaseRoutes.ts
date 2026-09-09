import { Router } from 'express';
import { ReleaseController } from '../controllers/releaseController';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';

export const releaseRoutes = Router();

releaseRoutes.get('/releases', authenticateToken, ReleaseController.listReleases);
releaseRoutes.get('/releases/:id', authenticateToken, ReleaseController.getRelease);
releaseRoutes.post(
  '/releases',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager']),
  ReleaseController.createRelease
);
releaseRoutes.put(
  '/releases/:id',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager']),
  ReleaseController.updateRelease
);
releaseRoutes.delete(
  '/releases/:id',
  authenticateToken,
  requireRoles(['admin', 'project-manager']),
  ReleaseController.deleteRelease
);
releaseRoutes.post(
  '/releases/:id/items',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager', 'developer']),
  ReleaseController.addItem
);
releaseRoutes.delete(
  '/releases/:id/items/:itemId',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager', 'developer']),
  ReleaseController.removeItem
);
