import { Router } from 'express';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';
import { RequirementController } from '../controllers/requirementController';
import { REQUIREMENT_DELETE_ROLES, REQUIREMENT_WRITE_ROLES } from '../services/requirementService';

/**
 * Sprint 17 — Requirements. Reads are open to every authenticated role and
 * scoped to the caller's projects in the service. The route roles are only a
 * first filter (requireRoles is hierarchical); project membership, approval
 * rights and the current-manager delete rule are enforced in
 * RequirementService.
 */
export const requirementRoutes = Router();

const write = requireRoles([...REQUIREMENT_WRITE_ROLES]);
const remove = requireRoles([...REQUIREMENT_DELETE_ROLES]);

requirementRoutes.get('/requirements', authenticateToken, RequirementController.list);
requirementRoutes.get('/requirements/:id', authenticateToken, RequirementController.get);
requirementRoutes.post('/requirements', authenticateToken, write, RequirementController.create);
requirementRoutes.patch('/requirements/:id/status', authenticateToken, write, RequirementController.updateStatus);
requirementRoutes.patch('/requirements/:id', authenticateToken, write, RequirementController.update);
requirementRoutes.delete('/requirements/:id', authenticateToken, remove, RequirementController.remove);
