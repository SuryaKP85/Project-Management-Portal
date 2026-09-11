import { Router } from 'express';
import { DependencyController } from '../controllers/dependencyController';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';

export const dependencyRoutes = Router();

dependencyRoutes.get('/dependencies', authenticateToken, DependencyController.listDependencies);
dependencyRoutes.get('/dependencies/kpis', authenticateToken, DependencyController.getKPIs);
dependencyRoutes.get('/dependencies/graph', authenticateToken, DependencyController.getGraph);
dependencyRoutes.get('/dependencies/chain/:entityId', authenticateToken, DependencyController.getChain);
dependencyRoutes.get('/dependencies/:id', authenticateToken, DependencyController.getDependency);

dependencyRoutes.post(
  '/dependencies',
  authenticateToken,
  requireRoles([
    'admin',
    'project-manager',
    'project_manager',
    'product-manager',
    'product_manager',
    'scrum-master',
    'scrum_master',
    'developer',
    'lead-developer',
    'lead_developer',
  ]),
  DependencyController.createDependency
);

dependencyRoutes.put(
  '/dependencies/:id',
  authenticateToken,
  requireRoles([
    'admin',
    'project-manager',
    'project_manager',
    'product-manager',
    'product_manager',
    'scrum-master',
    'scrum_master',
    'developer',
    'lead-developer',
    'lead_developer',
  ]),
  DependencyController.updateDependency
);

dependencyRoutes.patch(
  '/dependencies/:id',
  authenticateToken,
  requireRoles([
    'admin',
    'project-manager',
    'project_manager',
    'product-manager',
    'product_manager',
    'scrum-master',
    'scrum_master',
    'developer',
    'lead-developer',
    'lead_developer',
  ]),
  DependencyController.updateDependency
);

dependencyRoutes.delete(
  '/dependencies/:id',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'project_manager']),
  DependencyController.deleteDependency
);
