import { Router } from 'express';
import { DeliveryController } from '../controllers/deliveryController';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validation';

export const deliveryRoutes = Router();

// ================= EPICS =================
deliveryRoutes.get('/epics', authenticateToken, DeliveryController.listEpics);
deliveryRoutes.get('/epics/:id', authenticateToken, DeliveryController.getEpic);
deliveryRoutes.post(
  '/epics',
  authenticateToken,
  requireRoles(['admin', 'product-manager', 'project-manager']),
  validateBody([
    { field: 'name', required: true, type: 'string' },
    { field: 'projectId', required: true, type: 'string' },
  ]),
  DeliveryController.createEpic
);
deliveryRoutes.patch(
  '/epics/:id',
  authenticateToken,
  requireRoles(['admin', 'product-manager', 'project-manager']),
  DeliveryController.updateEpic
);
deliveryRoutes.delete(
  '/epics/:id',
  authenticateToken,
  requireRoles(['admin', 'product-manager']),
  DeliveryController.deleteEpic
);

// ================= FEATURES =================
deliveryRoutes.get('/features', authenticateToken, DeliveryController.listFeatures);
deliveryRoutes.get('/features/:id', authenticateToken, DeliveryController.getFeature);
deliveryRoutes.post(
  '/features',
  authenticateToken,
  requireRoles(['admin', 'product-manager', 'project-manager']),
  validateBody([
    { field: 'name', required: true, type: 'string' },
    { field: 'projectId', required: true, type: 'string' },
  ]),
  DeliveryController.createFeature
);
deliveryRoutes.patch(
  '/features/:id',
  authenticateToken,
  requireRoles(['admin', 'product-manager', 'project-manager']),
  DeliveryController.updateFeature
);
deliveryRoutes.delete(
  '/features/:id',
  authenticateToken,
  requireRoles(['admin', 'product-manager']),
  DeliveryController.deleteFeature
);

// ================= STORIES =================
deliveryRoutes.get('/stories', authenticateToken, DeliveryController.listStories);
deliveryRoutes.get('/stories/:id', authenticateToken, DeliveryController.getStory);
deliveryRoutes.post(
  '/stories',
  authenticateToken,
  requireRoles(['admin', 'product-manager', 'project-manager', 'team-member']),
  validateBody([
    { field: 'title', required: true, type: 'string' },
    { field: 'projectId', required: true, type: 'string' },
  ]),
  DeliveryController.createStory
);
deliveryRoutes.patch(
  '/stories/:id',
  authenticateToken,
  requireRoles(['admin', 'product-manager', 'project-manager', 'team-member']),
  DeliveryController.updateStory
);
deliveryRoutes.delete(
  '/stories/:id',
  authenticateToken,
  requireRoles(['admin', 'product-manager', 'project-manager']),
  DeliveryController.deleteStory
);

// ================= TASKS =================
deliveryRoutes.get('/tasks', authenticateToken, DeliveryController.listTasks);
deliveryRoutes.get('/tasks/:id', authenticateToken, DeliveryController.getTask);
deliveryRoutes.post(
  '/tasks',
  authenticateToken,
  requireRoles(['admin', 'product-manager', 'project-manager', 'team-member']),
  validateBody([
    { field: 'title', required: true, type: 'string' },
    { field: 'projectId', required: true, type: 'string' },
  ]),
  DeliveryController.createTask
);
deliveryRoutes.patch(
  '/tasks/:id',
  authenticateToken,
  requireRoles(['admin', 'product-manager', 'project-manager', 'team-member']),
  DeliveryController.updateTask
);
deliveryRoutes.delete(
  '/tasks/:id',
  authenticateToken,
  requireRoles(['admin', 'product-manager', 'project-manager']),
  DeliveryController.deleteTask
);

// ================= SUBTASKS =================
deliveryRoutes.get('/subtasks', authenticateToken, DeliveryController.listSubtasks);
deliveryRoutes.get('/subtasks/:id', authenticateToken, DeliveryController.getSubtask);
deliveryRoutes.post(
  '/subtasks',
  authenticateToken,
  requireRoles(['admin', 'product-manager', 'project-manager', 'team-member']),
  validateBody([
    { field: 'title', required: true, type: 'string' },
    { field: 'taskId', required: true, type: 'string' },
  ]),
  DeliveryController.createSubtask
);
deliveryRoutes.patch(
  '/subtasks/:id',
  authenticateToken,
  requireRoles(['admin', 'product-manager', 'project-manager', 'team-member']),
  DeliveryController.updateSubtask
);
deliveryRoutes.delete(
  '/subtasks/:id',
  authenticateToken,
  requireRoles(['admin', 'product-manager', 'project-manager', 'team-member']),
  DeliveryController.deleteSubtask
);

// ================= TRACEABILITY & SUMMARY =================
deliveryRoutes.get('/delivery/trace/:entityType/:id', authenticateToken, DeliveryController.getTrace);
deliveryRoutes.get('/delivery/summary', authenticateToken, DeliveryController.getSummary);
