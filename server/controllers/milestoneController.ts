import { Request, Response, NextFunction } from 'express';
import { MilestoneService } from '../services/milestoneService';

function getActor(req: Request) {
  if (!req.user) {
    return { id: 'usr_admin_1', name: 'Surya Prashanth' };
  }
  return {
    id: req.user.userId,
    name: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
  };
}

export const MilestoneController = {
  async listMilestones(req: Request, res: Response, next: NextFunction) {
    try {
      const milestones = await MilestoneService.getAllMilestones(req.query as any);
      res.json({ success: true, data: { milestones } });
    } catch (err) {
      next(err);
    }
  },

  async getMilestone(req: Request, res: Response, next: NextFunction) {
    try {
      const milestone = await MilestoneService.getMilestoneById(req.params.id);
      if (!milestone) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Milestone not found' } });
      }
      res.json({ success: true, data: { milestone } });
    } catch (err) {
      next(err);
    }
  },

  async createMilestone(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      const milestone = await MilestoneService.createMilestone(req.body, actor);
      res.status(201).json({ success: true, data: { milestone } });
    } catch (err) {
      next(err);
    }
  },

  async updateMilestone(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      const milestone = await MilestoneService.updateMilestone(req.params.id, req.body, actor);
      if (!milestone) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Milestone not found' } });
      }
      res.json({ success: true, data: { milestone } });
    } catch (err) {
      next(err);
    }
  },

  async deleteMilestone(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      const deleted = await MilestoneService.deleteMilestone(req.params.id, actor);
      if (!deleted) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Milestone not found' } });
      }
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  },

  async linkItem(req: Request, res: Response, next: NextFunction) {
    try {
      const { targetType, targetId, targetCode, targetName } = req.body;
      const link = await MilestoneService.linkItem(req.params.id, targetType, targetId, targetCode, targetName);
      res.status(201).json({ success: true, data: { link } });
    } catch (err) {
      next(err);
    }
  },

  async unlinkItem(req: Request, res: Response, next: NextFunction) {
    try {
      const removed = await MilestoneService.unlinkItem(req.params.linkId);
      res.json({ success: true, data: { removed } });
    } catch (err) {
      next(err);
    }
  },
};
