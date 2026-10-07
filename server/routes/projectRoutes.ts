import { Router } from 'express';
import { ProjectController } from '../controllers/projectController';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validation';

export const projectRoutes = Router();

projectRoutes.get('/projects', authenticateToken, ProjectController.list);

// Registered before '/projects/:id' so Express does not bind :id to 'health'.
projectRoutes.get('/projects/health', authenticateToken, ProjectController.listHealth);
projectRoutes.get('/projects/:id/health', authenticateToken, ProjectController.getHealth);
// Sprint 22B: live, read-only project status report (project read access; 404 otherwise).
projectRoutes.get('/projects/:id/status-report', authenticateToken, ProjectController.getStatusReport);

projectRoutes.get('/projects/:id', authenticateToken, ProjectController.getById);
projectRoutes.post(
  '/projects/migrate',
  authenticateToken,
  requireRoles(['admin', 'project-manager']),
  ProjectController.migrate
);
projectRoutes.post(
  '/projects',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager']),
  validateBody([
    { field: 'name', required: true, type: 'string' },
    { field: 'client', required: true, type: 'string' },
  ]),
  ProjectController.create
);
projectRoutes.patch(
  '/projects/:id',
  authenticateToken,
  requireRoles(['admin', 'project-manager']),
  ProjectController.update
);
projectRoutes.delete(
  '/projects/:id',
  authenticateToken,
  requireRoles(['admin']),
  ProjectController.delete
);
