import { Request, Response, NextFunction } from 'express';
import { RequirementService } from '../services/requirementService';
import { RequirementDecompositionService } from '../services/requirementDecompositionService';
import { StoryRefinementService } from '../services/storyRefinementService';
import { FollowThroughActor } from '../services/followThroughSupport';

/**
 * Sprint 17 — HTTP layer for requirements. Identity comes only from the
 * verified JWT; RequirementService applies project scope and every role rule.
 * Typed service errors reach the global errorHandler through next().
 */

function actorFrom(req: Request): FollowThroughActor | null {
  if (!req.user) return null;
  return {
    userId: req.user.userId,
    role: req.user.role,
    name: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
    ipAddress: req.ip,
  };
}

type Handler = (actor: FollowThroughActor, req: Request, res: Response) => Promise<unknown>;

function handle(fn: Handler) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFrom(req);
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
      }
      await fn(actor, req, res);
    } catch (err) {
      next(err);
    }
  };
}

const body = (req: Request): Record<string, unknown> =>
  (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

export const RequirementController = {
  list: handle(async (actor, req, res) => res.json({ success: true, data: await RequirementService.list(actor, req.query as any) })),
  get: handle(async (actor, req, res) => res.json({ success: true, data: { requirement: await RequirementService.get(actor, req.params.id) } })),
  create: handle(async (actor, req, res) => res.status(201).json({ success: true, data: { requirement: await RequirementService.create(actor, body(req)) } })),
  update: handle(async (actor, req, res) => res.json({ success: true, data: { requirement: await RequirementService.update(actor, req.params.id, body(req)) } })),
  updateStatus: handle(async (actor, req, res) => res.json({ success: true, data: { requirement: await RequirementService.updateStatus(actor, req.params.id, body(req)) } })),
  remove: handle(async (actor, req, res) => {
    await RequirementService.remove(actor, req.params.id);
    res.json({ success: true, data: { deleted: true } });
  }),
  // Sprint 18 — decomposition.
  propose: handle(async (actor, req, res) => res.json({ success: true, data: { proposal: await RequirementDecompositionService.propose(actor, req.params.id) } })),
  approveDecomposition: handle(async (actor, req, res) => res.status(201).json({ success: true, data: { decomposition: await RequirementDecompositionService.approve(actor, req.params.id, body(req)) } })),
  links: handle(async (actor, req, res) => res.json({ success: true, data: { links: await RequirementDecompositionService.linkedRecords(actor, req.params.id) } })),
  // Sprint 19 — story refinement (shares this controller's actor handling) and the story's originating requirement.
  refineStory: handle(async (actor, req, res) => res.json({ success: true, data: { proposal: await StoryRefinementService.propose(actor, req.params.id) } })),
  storyOrigin: handle(async (actor, req, res) => res.json({ success: true, data: { requirement: await StoryRefinementService.origin(actor, req.params.id) } })),
};
