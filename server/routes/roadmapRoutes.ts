import { Router } from 'express';
import { RoadmapController } from '../controllers/roadmapController';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validation';

export const roadmapRoutes = Router();

/**
 * Sprint 9.3 — roadmap access control.
 *
 * Reads follow the application-wide convention of authenticateToken alone.
 * Writes mirror goalRoutes, the closest strategic analogue: management roles
 * may create, amend and reorder; deletion is reserved to admins.
 */
const ROADMAP_WRITE_ROLES = ['admin', 'project-manager', 'product-manager'] as const;
const ROADMAP_DELETE_ROLES = ['admin'] as const;

roadmapRoutes.get('/roadmap', authenticateToken, RoadmapController.list);

// Registered before '/roadmap/:id' so the literal path is not bound as an id.
roadmapRoutes.put(
  '/roadmap/reorder',
  authenticateToken,
  requireRoles([...ROADMAP_WRITE_ROLES]),
  RoadmapController.reorder
);

// Goal alignment. Registered before '/roadmap/:id' so the nested link paths
// are matched ahead of the bare id route.
roadmapRoutes.post(
  '/roadmap/:id/links',
  authenticateToken,
  requireRoles([...ROADMAP_WRITE_ROLES]),
  RoadmapController.linkGoal
);

roadmapRoutes.delete(
  '/roadmap/:id/links/:linkId',
  authenticateToken,
  requireRoles([...ROADMAP_WRITE_ROLES]),
  RoadmapController.unlinkGoal
);

// Reverse lookup: initiatives aligned to a goal.
roadmapRoutes.get('/goals/:id/roadmap', authenticateToken, RoadmapController.listForGoal);

roadmapRoutes.get('/roadmap/:id', authenticateToken, RoadmapController.getById);

roadmapRoutes.post(
  '/roadmap',
  authenticateToken,
  requireRoles([...ROADMAP_WRITE_ROLES]),
  validateBody([{ field: 'name', required: true, type: 'string' }]),
  RoadmapController.create
);

roadmapRoutes.patch(
  '/roadmap/:id',
  authenticateToken,
  requireRoles([...ROADMAP_WRITE_ROLES]),
  RoadmapController.update
);

roadmapRoutes.delete(
  '/roadmap/:id',
  authenticateToken,
  requireRoles([...ROADMAP_DELETE_ROLES]),
  RoadmapController.delete
);
