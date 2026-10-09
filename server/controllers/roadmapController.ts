import { respondToDatabaseFailure } from '../middleware/errorHandler';
import { Request, Response, NextFunction } from 'express';
import { RoadmapService } from '../services/roadmapService';
import { RoadmapFilter, RoadmapRepository } from '../repositories/roadmapRepository';
import { ProjectScope, scopeActor } from '../services/projectScope';

/**
 * Sprint 9.3 — roadmap HTTP layer.
 *
 * Thin by design: validation, ordering and derived progress all live in
 * RoadmapService. This layer resolves the request, shapes the response and
 * maps service validation failures onto the existing API error format.
 */

/** Accepted shape for a roadmap identifier. */
const ROADMAP_ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

/** Maximum entries accepted in a single reorder batch. */
const MAX_REORDER_ENTRIES = 200;

function getActor(req: Request) {
  if (!req.user) return null;
  return {
    id: req.user.userId,
    name: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
  };
}

function unauthorized(res: Response) {
  return res.status(401).json({
    success: false,
    error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
  });
}

function notFound(res: Response) {
  return res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Roadmap item not found' },
  });
}

function validationError(res: Response, message: string, details?: string[]) {
  return res.status(400).json({
    success: false,
    error: { code: 'VALIDATION_ERROR', message, ...(details ? { details } : {}) },
  });
}

/**
 * Sprint 25 — project scoping. An item chartered to a project is visible only to
 * people who can see that project (404 otherwise, revealing nothing), and changing
 * it needs write access to that project and, when it moves, to the new one.
 * Org-level items (no project) keep their behaviour.
 */
async function visibleItem(req: Request, id: string) {
  const item = await RoadmapRepository.findById(id);
  if (!item) return null;
  return (await ProjectScope.canReadOptional(scopeActor(req), item.projectId)) ? item : null;
}

async function assertItemWrite(req: Request, current: { projectId?: string } | null, nextProjectId: unknown) {
  const actor = scopeActor(req);
  await ProjectScope.assertWriteOptional(actor, current?.projectId, 'Roadmap item');
  if (typeof nextProjectId === 'string' && nextProjectId.trim() && nextProjectId.trim() !== current?.projectId) {
    await ProjectScope.assertWrite(actor, nextProjectId.trim(), 'Project');
  }
}

/** Access errors keep their status (403/404) instead of becoming validation errors. */
function accessError(res: Response, err: any): boolean {
  if (err?.status !== 403 && err?.status !== 404 && err?.status !== 401) return false;
  res.status(err.status).json({ success: false, error: { code: err.code || 'NOT_FOUND', message: err.message } });
  return true;
}

/** Builds a repository filter from query params, ignoring anything unknown. */
function buildFilter(req: Request): RoadmapFilter & { goalId?: string } {
  const pick = (key: string): string | undefined => {
    const value = req.query[key];
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  };

  return {
    productId: pick('productId'),
    portfolioId: pick('portfolioId'),
    projectId: pick('projectId'),
    ownerId: pick('ownerId'),
    status: pick('status'),
    priority: pick('priority'),
    search: pick('search'),
    // Resolved through the link junction rather than a column on the item.
    goalId: pick('goalId'),
  };
}

export const RoadmapController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await ProjectScope.filterOptional(scopeActor(req), await RoadmapService.getAllItems(buildFilter(req)), (i) => i.projectId);
      res.json({ success: true, data: { items, total: items.length } });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id ?? '').trim();
      if (!ROADMAP_ID_PATTERN.test(id)) {
        return validationError(res, 'Invalid roadmap item identifier.');
      }

      if (!(await visibleItem(req, id))) return notFound(res);
      // Includes server-derived goal alignment; linkedGoals is never persisted.
      const item = await RoadmapService.getItemWithLinks(id);
      if (!item) return notFound(res);

      res.json({ success: true, data: { item } });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, _next: NextFunction) {
    try {
      const actor = getActor(req);
      if (!actor) return unauthorized(res);

      await assertItemWrite(req, null, req.body?.projectId);
      const item = await RoadmapService.createItem(req.body || {}, actor);
      res.status(201).json({ success: true, data: { item } });
    } catch (err: any) {
      if (accessError(res, err)) return;
      // Sprint 23: an identity conflict stays a 409 (the record was never replaced).
      if (err?.status === 409) return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: err.message } });
      // Service validation failures are client errors, not server faults.
      if (respondToDatabaseFailure(res, err)) return; // Sprint 24
      return validationError(res, err?.message || 'Could not create roadmap item.');
    }
  },

  async update(req: Request, res: Response, _next: NextFunction) {
    try {
      const actor = getActor(req);
      if (!actor) return unauthorized(res);

      const id = String(req.params.id ?? '').trim();
      if (!ROADMAP_ID_PATTERN.test(id)) {
        return validationError(res, 'Invalid roadmap item identifier.');
      }

      const current = await visibleItem(req, id);
      if (!current) return notFound(res);
      await assertItemWrite(req, current, req.body?.projectId);
      const updated = await RoadmapService.updateItem(id, req.body || {}, actor);
      if (!updated) return notFound(res);

      res.json({ success: true, data: { item: updated } });
    } catch (err: any) {
      if (accessError(res, err)) return;
      if (respondToDatabaseFailure(res, err)) return; // Sprint 24
      return validationError(res, err?.message || 'Could not update roadmap item.');
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      if (!actor) return unauthorized(res);

      const id = String(req.params.id ?? '').trim();
      if (!ROADMAP_ID_PATTERN.test(id)) {
        return validationError(res, 'Invalid roadmap item identifier.');
      }

      const current = await visibleItem(req, id);
      if (!current) return notFound(res);
      await assertItemWrite(req, current, undefined);
      const deleted = await RoadmapService.deleteItem(id, actor);
      if (!deleted) return notFound(res);

      res.json({ success: true, data: { deleted: true, message: 'Roadmap item deleted successfully' } });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /roadmap/:id/links — align a roadmap item to a goal.
   * The client supplies identifiers only; the target's code and name are
   * resolved server-side so a caller cannot inject display text.
   */
  async linkGoal(req: Request, res: Response, _next: NextFunction) {
    try {
      const actor = getActor(req);
      if (!actor) return unauthorized(res);

      const id = String(req.params.id ?? '').trim();
      if (!ROADMAP_ID_PATTERN.test(id)) {
        return validationError(res, 'Invalid roadmap item identifier.');
      }

      const { targetType, targetId } = req.body || {};

      if (targetType !== 'goal') {
        return validationError(res, "Unsupported targetType.", ["Only targetType 'goal' is supported."]);
      }
      if (typeof targetId !== 'string' || targetId.trim() === '') {
        return validationError(res, 'A targetId is required.');
      }

      const current = await visibleItem(req, id);
      if (!current) return notFound(res);
      await assertItemWrite(req, current, undefined);
      const link = await RoadmapService.linkGoal(id, targetId.trim(), actor);
      if (!link) return notFound(res);

      res.status(201).json({ success: true, data: { link } });
    } catch (err: any) {
      if (accessError(res, err)) return;
      if (respondToDatabaseFailure(res, err)) return; // Sprint 24
      return validationError(res, err?.message || 'Could not link the goal.');
    }
  },

  /** DELETE /roadmap/:id/links/:linkId — remove one goal alignment. */
  async unlinkGoal(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      if (!actor) return unauthorized(res);

      const id = String(req.params.id ?? '').trim();
      const linkId = String(req.params.linkId ?? '').trim();
      if (!ROADMAP_ID_PATTERN.test(id) || !ROADMAP_ID_PATTERN.test(linkId)) {
        return validationError(res, 'Invalid roadmap item or link identifier.');
      }

      const current = await visibleItem(req, id);
      if (!current) return notFound(res);
      await assertItemWrite(req, current, undefined);
      const removed = await RoadmapService.unlinkGoal(id, linkId, actor);
      if (!removed) return notFound(res);

      res.json({ success: true, data: { removed: true } });
    } catch (err) {
      next(err);
    }
  },

  /** GET /goals/:id/roadmap — initiatives aligned to a goal. */
  async listForGoal(req: Request, res: Response, next: NextFunction) {
    try {
      const goalId = String(req.params.id ?? '').trim();
      if (!ROADMAP_ID_PATTERN.test(goalId)) {
        return validationError(res, 'Invalid goal identifier.');
      }

      const items = await ProjectScope.filterOptional(scopeActor(req), await RoadmapService.getItemsForGoal(goalId), (i) => i.projectId);
      res.json({ success: true, data: { items, total: items.length } });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /roadmap/reorder — bulk display-order update.
   * Registered ahead of '/roadmap/:id' so the literal path is not captured.
   */
  async reorder(req: Request, res: Response, _next: NextFunction) {
    try {
      const actor = getActor(req);
      if (!actor) return unauthorized(res);

      const body = req.body || {};
      const entries = Array.isArray(body) ? body : body.items;

      if (!Array.isArray(entries) || entries.length === 0) {
        return validationError(res, 'Reorder requires a non-empty items array.', [
          'Send { "items": [{ "id": "rm_1", "sequence": 10 }] }',
        ]);
      }

      // Bounded so a single request cannot submit an unbounded batch.
      if (entries.length > MAX_REORDER_ENTRIES) {
        return validationError(res, `Reorder accepts at most ${MAX_REORDER_ENTRIES} items per request.`);
      }

      // Sprint 25: every item that exists must be one the caller may change.
      for (const entry of entries) {
        if (!entry || typeof entry.id !== 'string') continue;
        const item = await RoadmapRepository.findById(entry.id);
        if (!item) continue;
        if (!(await ProjectScope.canReadOptional(scopeActor(req), item.projectId))) return notFound(res);
        await assertItemWrite(req, item, undefined);
      }
      const result = await RoadmapService.reorderItems(entries, actor);
      res.json({ success: true, data: result });
    } catch (err: any) {
      if (accessError(res, err)) return;
      if (respondToDatabaseFailure(res, err)) return; // Sprint 24
      return validationError(res, err?.message || 'Could not reorder roadmap items.');
    }
  },
};
