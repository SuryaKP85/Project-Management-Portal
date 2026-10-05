import { Router } from 'express';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';
import { rateLimit } from '../middleware/rateLimit';
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
/** Sprint 18: decomposition uses the AI generate roles; project write access is checked in the service. */
const decompose = requireRoles(['admin', 'project-manager', 'product-manager']);
/** The proposal is an AI call, so it shares the per-user AI quota (same bucket as /ai/*). */
const aiQuota = rateLimit({
  bucket: 'ai-assistant',
  max: Number(process.env.AI_RATE_LIMIT_MAX || 20),
  windowMs: Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 60_000),
});

requirementRoutes.get('/requirements', authenticateToken, RequirementController.list);
requirementRoutes.get('/requirements/:id', authenticateToken, RequirementController.get);
requirementRoutes.post('/requirements', authenticateToken, write, RequirementController.create);
requirementRoutes.patch('/requirements/:id/status', authenticateToken, write, RequirementController.updateStatus);
requirementRoutes.patch('/requirements/:id', authenticateToken, write, RequirementController.update);
requirementRoutes.delete('/requirements/:id', authenticateToken, remove, RequirementController.remove);

// Sprint 18 — Requirement decomposition: AI proposal (nothing stored), human approval (atomic creation), linked records.
requirementRoutes.post('/requirements/:id/decomposition/proposal', authenticateToken, decompose, aiQuota, RequirementController.propose);
requirementRoutes.post('/requirements/:id/decomposition', authenticateToken, decompose, RequirementController.approveDecomposition);
requirementRoutes.get('/requirements/:id/links', authenticateToken, RequirementController.links);

// Sprint 19 — AI story refinement (a temporary proposal; saving is the existing PATCH /stories/:id) and the story's originating requirement.
requirementRoutes.post('/stories/:id/refinement/proposal', authenticateToken, decompose, aiQuota, RequirementController.refineStory);
requirementRoutes.get('/stories/:id/origin', authenticateToken, RequirementController.storyOrigin);
