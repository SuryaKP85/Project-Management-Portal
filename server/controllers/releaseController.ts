import { Request, Response, NextFunction } from 'express';
import { ReleaseService } from '../services/releaseService';
import { ReleaseRepository } from '../repositories/releaseRepository';
import { ProjectScope, scopeActor } from '../services/projectScope';
import { notAvailable } from '../services/followThroughSupport';

function getActor(req: Request) {
  if (!req.user) {
    return { id: 'usr_admin_1', name: 'Surya Prashanth' };
  }
  return {
    id: req.user.userId,
    name: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
  };
}

/**
 * Sprint 22A: a release with a project is visible only to people who can see
 * that project; a product-level release (no project) stays visible as before.
 */
async function visibleRelease(req: Request, id: string) {
  const release = await ReleaseService.getReleaseById(id);
  return release && (await ProjectScope.canReadOptional(scopeActor(req), release.projectId)) ? release : null;
}

const notFound = (res: Response) => res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Release not found' } });

export const ReleaseController = {
  async listReleases(req: Request, res: Response, next: NextFunction) {
    try {
      const releases = await ProjectScope.filterOptional(scopeActor(req), await ReleaseService.getAllReleases(req.query as any), (r) => r.projectId);
      res.json({ success: true, data: { releases } });
    } catch (err) {
      next(err);
    }
  },

  async getRelease(req: Request, res: Response, next: NextFunction) {
    try {
      const release = await visibleRelease(req, req.params.id);
      if (!release) return notFound(res);
      res.json({ success: true, data: { release } });
    } catch (err) {
      next(err);
    }
  },

  async createRelease(req: Request, res: Response, next: NextFunction) {
    try {
      await ProjectScope.assertWriteOptional(scopeActor(req), req.body?.projectId, 'Project');
      const actor = getActor(req);
      const release = await ReleaseService.createRelease(req.body, actor);
      res.status(201).json({ success: true, data: { release } });
    } catch (err) {
      next(err);
    }
  },

  async updateRelease(req: Request, res: Response, next: NextFunction) {
    try {
      const scope = scopeActor(req);
      const existing = await visibleRelease(req, req.params.id);
      if (!existing) return notFound(res);
      await ProjectScope.assertWriteOptional(scope, existing.projectId, 'Release');
      const target = req.body?.projectId;
      if (target !== undefined && target !== null && target !== '' && target !== existing.projectId) {
        await ProjectScope.assertWrite(scope, typeof target === 'string' ? target : undefined, 'Project');
      }
      const actor = getActor(req);
      const release = await ReleaseService.updateRelease(req.params.id, req.body, actor);
      if (!release) return notFound(res);
      res.json({ success: true, data: { release } });
    } catch (err) {
      next(err);
    }
  },

  async deleteRelease(req: Request, res: Response, next: NextFunction) {
    try {
      const existing = await visibleRelease(req, req.params.id);
      if (!existing) return notFound(res);
      await ProjectScope.assertWriteOptional(scopeActor(req), existing.projectId, 'Release');
      const actor = getActor(req);
      const deleted = await ReleaseService.deleteRelease(req.params.id, actor);
      if (!deleted) return notFound(res);
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  },

  async addItem(req: Request, res: Response, next: NextFunction) {
    try {
      const scope = scopeActor(req);
      const release = await visibleRelease(req, req.params.id);
      if (!release) return notFound(res);
      await ProjectScope.assertWriteOptional(scope, release.projectId, 'Release');
      const { itemType, itemId, itemCode, itemTitle, status, progress } = req.body;
      await ProjectScope.assertLinkTarget(scope, itemType, itemId);
      const item = await ReleaseService.addReleaseItem(
        release.id,
        itemType,
        itemId,
        itemCode,
        itemTitle,
        status,
        progress
      );
      res.status(201).json({ success: true, data: { item } });
    } catch (err) {
      next(err);
    }
  },

  async removeItem(req: Request, res: Response, next: NextFunction) {
    try {
      const release = await visibleRelease(req, req.params.id);
      if (!release) return notFound(res);
      await ProjectScope.assertWriteOptional(scopeActor(req), release.projectId, 'Release');
      // The item must belong to this release (never removed by item id alone).
      if (!(await ReleaseRepository.getReleaseItems(release.id)).some((i) => i.id === req.params.itemId)) throw notAvailable('Release item');
      const removed = await ReleaseService.removeReleaseItem(req.params.itemId);
      res.json({ success: true, data: { removed } });
    } catch (err) {
      next(err);
    }
  },
};
