import { Request, Response, NextFunction } from 'express';
import { MilestoneService } from '../services/milestoneService';
import { ProjectScope, scopeActor } from '../services/projectScope';

function getActor(req: Request) {
  if (!req.user) {
    return { id: 'usr_admin_1', name: 'Surya Prashanth' };
  }
  return {
    id: req.user.userId,
    name: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
  };
}

/** Sprint 22A: the milestone when the caller can see its project; otherwise null (a 404 that reveals nothing). */
async function visibleMilestone(req: Request, id: string) {
  const milestone = await MilestoneService.getMilestoneById(id);
  return milestone && (await ProjectScope.canRead(scopeActor(req), milestone.projectId)) ? milestone : null;
}

const notFound = (res: Response) => res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Milestone not found' } });

export const MilestoneController = {
  async listMilestones(req: Request, res: Response, next: NextFunction) {
    try {
      const milestones = await ProjectScope.filter(scopeActor(req), await MilestoneService.getAllMilestones(req.query as any), (m) => m.projectId);
      res.json({ success: true, data: { milestones } });
    } catch (err) {
      next(err);
    }
  },

  async getMilestone(req: Request, res: Response, next: NextFunction) {
    try {
      const milestone = await visibleMilestone(req, req.params.id);
      if (!milestone) return notFound(res);
      res.json({ success: true, data: { milestone } });
    } catch (err) {
      next(err);
    }
  },

  async createMilestone(req: Request, res: Response, next: NextFunction) {
    try {
      await ProjectScope.assertWrite(scopeActor(req), req.body?.projectId, 'Project');
      const actor = getActor(req);
      const milestone = await MilestoneService.createMilestone(req.body, actor);
      res.status(201).json({ success: true, data: { milestone } });
    } catch (err) {
      next(err);
    }
  },

  async updateMilestone(req: Request, res: Response, next: NextFunction) {
    try {
      const existing = await visibleMilestone(req, req.params.id);
      if (!existing) return notFound(res);
      await ProjectScope.assertMove(scopeActor(req), existing.projectId, req.body?.projectId, 'Milestone');
      const actor = getActor(req);
      const milestone = await MilestoneService.updateMilestone(req.params.id, req.body, actor);
      if (!milestone) return notFound(res);
      res.json({ success: true, data: { milestone } });
    } catch (err) {
      next(err);
    }
  },

  async deleteMilestone(req: Request, res: Response, next: NextFunction) {
    try {
      const existing = await visibleMilestone(req, req.params.id);
      if (!existing) return notFound(res);
      await ProjectScope.assertWrite(scopeActor(req), existing.projectId, 'Milestone');
      const actor = getActor(req);
      const deleted = await MilestoneService.deleteMilestone(req.params.id, actor);
      if (!deleted) return notFound(res);
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  },

  async linkItem(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = scopeActor(req);
      const milestone = await visibleMilestone(req, req.params.id);
      if (!milestone) return notFound(res);
      await ProjectScope.assertWrite(actor, milestone.projectId, 'Milestone');
      const { targetType, targetId, targetCode, targetName } = req.body;
      await ProjectScope.assertLinkTarget(actor, targetType, targetId);
      const link = await MilestoneService.linkItem(milestone.id, targetType, targetId, targetCode, targetName);
      res.status(201).json({ success: true, data: { link } });
    } catch (err) {
      next(err);
    }
  },

  async unlinkItem(req: Request, res: Response, next: NextFunction) {
    try {
      const milestone = await visibleMilestone(req, req.params.id);
      if (!milestone) return notFound(res);
      await ProjectScope.assertWrite(scopeActor(req), milestone.projectId, 'Milestone');
      const removed = await ProjectScope.removeOwnLink('milestone', milestone.id, req.params.linkId);
      res.json({ success: true, data: { removed } });
    } catch (err) {
      next(err);
    }
  },
};
