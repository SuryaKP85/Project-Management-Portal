import { Request, Response, NextFunction } from 'express';
import { RoadmapService } from '../services/roadmapService';
import { RoadmapFilter } from '../repositories/roadmapRepository';

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
      const items = await RoadmapService.getAllItems(buildFilter(req));
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

      const item = await RoadmapService.createItem(req.body || {}, actor);
      res.status(201).json({ success: true, data: { item } });
    } catch (err: any) {
      // Service validation failures are client errors, not server faults.
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

      const updated = await RoadmapService.updateItem(id, req.body || {}, actor);
      if (!updated) return notFound(res);

      res.json({ success: true, data: { item: updated } });
    } catch (err: any) {
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

      const link = await RoadmapService.linkGoal(id, targetId.trim(), actor);
      if (!link) return notFound(res);

      res.status(201).json({ success: true, data: { link } });
    } catch (err: any) {
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

      const items = await RoadmapService.getItemsForGoal(goalId);
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

      const result = await RoadmapService.reorderItems(entries, actor);
      res.json({ success: true, data: result });
    } catch (err: any) {
      return validationError(res, err?.message || 'Could not reorder roadmap items.');
    }
  },
};
