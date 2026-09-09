import { Router } from 'express';
import { SprintController } from '../controllers/sprintController';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validation';

export const sprintRoutes = Router();

// List & Get
sprintRoutes.get('/sprints', authenticateToken, SprintController.listSprints);
sprintRoutes.get('/sprints/:id', authenticateToken, SprintController.getSprint);

// Create, Update, Delete
sprintRoutes.post(
  '/sprints',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager']),
  validateBody([
    { field: 'name', required: true, type: 'string' },
    { field: 'projectId', required: true, type: 'string' },
    { field: 'startDate', required: true, type: 'string' },
    { field: 'endDate', required: true, type: 'string' },
  ]),
  SprintController.createSprint
);

sprintRoutes.patch(
  '/sprints/:id',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager']),
  SprintController.updateSprint
);

sprintRoutes.put(
  '/sprints/:id',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager']),
  SprintController.updateSprint
);

sprintRoutes.delete(
  '/sprints/:id',
  authenticateToken,
  requireRoles(['admin', 'project-manager']),
  SprintController.deleteSprint
);

// Lifecycle: Start & Complete
sprintRoutes.post(
  '/sprints/:id/start',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager']),
  SprintController.startSprint
);

sprintRoutes.post(
  '/sprints/:id/complete',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager']),
  SprintController.completeSprint
);

// Sprint Items
sprintRoutes.get('/sprints/:id/items', authenticateToken, SprintController.getSprintItems);
sprintRoutes.post(
  '/sprints/:id/items',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager', 'team-member']),
  SprintController.addSprintItem
);
sprintRoutes.delete(
  '/sprints/:id/items/:itemId',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager', 'team-member']),
  SprintController.removeSprintItem
);

// Capacity & Burndown
sprintRoutes.get('/sprints/:id/capacity', authenticateToken, SprintController.getSprintCapacity);
sprintRoutes.get('/sprints/:id/burndown', authenticateToken, SprintController.getSprintBurndown);
