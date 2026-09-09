import { Router } from 'express';
import { DependencyController } from '../controllers/dependencyController';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';

export const dependencyRoutes = Router();

dependencyRoutes.get('/dependencies', authenticateToken, DependencyController.listDependencies);
dependencyRoutes.get('/dependencies/graph', authenticateToken, DependencyController.getGraph);
dependencyRoutes.get('/dependencies/chain/:entityId', authenticateToken, DependencyController.getChain);
dependencyRoutes.get('/dependencies/:id', authenticateToken, DependencyController.getDependency);
dependencyRoutes.post(
  '/dependencies',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager', 'developer']),
  DependencyController.createDependency
);
dependencyRoutes.put(
  '/dependencies/:id',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager', 'developer']),
  DependencyController.updateDependency
);
dependencyRoutes.delete(
  '/dependencies/:id',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager', 'developer']),
  DependencyController.deleteDependency
);
