import { Request, Response, NextFunction } from 'express';
import { ReleaseService } from '../services/releaseService';

function getActor(req: Request) {
  if (!req.user) {
    return { id: 'usr_admin_1', name: 'Surya Prashanth' };
  }
  return {
    id: req.user.userId,
    name: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
  };
}

export const ReleaseController = {
  async listReleases(req: Request, res: Response, next: NextFunction) {
    try {
      const releases = await ReleaseService.getAllReleases(req.query as any);
      res.json({ success: true, data: { releases } });
    } catch (err) {
      next(err);
    }
  },

  async getRelease(req: Request, res: Response, next: NextFunction) {
    try {
      const release = await ReleaseService.getReleaseById(req.params.id);
      if (!release) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Release not found' } });
      }
      res.json({ success: true, data: { release } });
    } catch (err) {
      next(err);
    }
  },

  async createRelease(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      const release = await ReleaseService.createRelease(req.body, actor);
      res.status(201).json({ success: true, data: { release } });
    } catch (err) {
      next(err);
    }
  },

  async updateRelease(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      const release = await ReleaseService.updateRelease(req.params.id, req.body, actor);
      if (!release) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Release not found' } });
      }
      res.json({ success: true, data: { release } });
    } catch (err) {
      next(err);
    }
  },

  async deleteRelease(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      const deleted = await ReleaseService.deleteRelease(req.params.id, actor);
      if (!deleted) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Release not found' } });
      }
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  },

  async addItem(req: Request, res: Response, next: NextFunction) {
    try {
      const { itemType, itemId, itemCode, itemTitle, status, progress } = req.body;
      const item = await ReleaseService.addReleaseItem(
        req.params.id,
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
      const removed = await ReleaseService.removeReleaseItem(req.params.itemId);
      res.json({ success: true, data: { removed } });
    } catch (err) {
      next(err);
    }
  },
};
