import { Router } from 'express';
import { IssueController } from '../controllers/issueController';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';

export const issueRoutes = Router();

issueRoutes.get('/issues', authenticateToken, IssueController.listIssues);
issueRoutes.get('/issues/analytics/root-causes', authenticateToken, IssueController.getRootCauses);
issueRoutes.get('/issues/:id', authenticateToken, IssueController.getIssue);
issueRoutes.post(
  '/issues',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager', 'developer', 'qa-engineer', 'guest']),
  IssueController.createIssue
);
issueRoutes.put(
  '/issues/:id',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager', 'developer', 'qa-engineer']),
  IssueController.updateIssue
);
issueRoutes.delete(
  '/issues/:id',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager']),
  IssueController.deleteIssue
);
issueRoutes.post(
  '/issues/:id/links',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager', 'developer', 'qa-engineer']),
  IssueController.linkItem
);
issueRoutes.delete(
  '/issues/:id/links/:linkId',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager', 'developer', 'qa-engineer']),
  IssueController.unlinkItem
);
