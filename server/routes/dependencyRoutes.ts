import { Router } from 'express';
import { DependencyController } from '../controllers/dependencyController';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';

export const dependencyRoutes = Router();

// Canonical write/delete role sets, expressed with the application's real
// UserRole values (see server/auth/rbac.ts). Delivery roles such as
// "developer", "scrum-master" and "lead-developer" are represented by
// 'team-member' in this application's role model.
const DEPENDENCY_WRITE_ROLES = ['admin', 'project-manager', 'product-manager', 'team-member'] as const;
const DEPENDENCY_DELETE_ROLES = ['admin', 'project-manager'] as const;

dependencyRoutes.get('/dependencies', authenticateToken, DependencyController.listDependencies);
dependencyRoutes.get('/dependencies/kpis', authenticateToken, DependencyController.getKPIs);
dependencyRoutes.get('/dependencies/graph', authenticateToken, DependencyController.getGraph);
dependencyRoutes.get('/dependencies/chain/:entityId', authenticateToken, DependencyController.getChain);
dependencyRoutes.get('/dependencies/:id', authenticateToken, DependencyController.getDependency);

dependencyRoutes.post(
  '/dependencies',
  authenticateToken,
  requireRoles([...DEPENDENCY_WRITE_ROLES]),
  DependencyController.createDependency
);

dependencyRoutes.put(
  '/dependencies/:id',
  authenticateToken,
  requireRoles([...DEPENDENCY_WRITE_ROLES]),
  DependencyController.updateDependency
);

dependencyRoutes.patch(
  '/dependencies/:id',
  authenticateToken,
  requireRoles([...DEPENDENCY_WRITE_ROLES]),
  DependencyController.updateDependency
);

dependencyRoutes.delete(
  '/dependencies/:id',
  authenticateToken,
  requireRoles([...DEPENDENCY_DELETE_ROLES]),
  DependencyController.deleteDependency
);
