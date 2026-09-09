import { Router } from 'express';
import { RiskController } from '../controllers/riskController';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';

export const riskRoutes = Router();

riskRoutes.get('/risks', authenticateToken, RiskController.listRisks);
riskRoutes.get('/risks/analytics/heatmap', authenticateToken, RiskController.getHeatmap);
riskRoutes.post('/risks/projects/:projectId/audit', authenticateToken, RiskController.runProjectAudit);
riskRoutes.get('/risks/:id', authenticateToken, RiskController.getRisk);
riskRoutes.post(
  '/risks',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager']),
  RiskController.createRisk
);
riskRoutes.patch(
  '/risks/:id',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager']),
  RiskController.updateRisk
);
riskRoutes.put(
  '/risks/:id',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager']),
  RiskController.updateRisk
);
riskRoutes.delete(
  '/risks/:id',
  authenticateToken,
  requireRoles(['admin', 'project-manager']),
  RiskController.deleteRisk
);
riskRoutes.post(
  '/risks/:id/links',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager', 'developer']),
  RiskController.linkItem
);
riskRoutes.delete(
  '/risks/:id/links/:linkId',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager', 'developer']),
  RiskController.unlinkItem
);
