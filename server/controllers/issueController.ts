import { Request, Response, NextFunction } from 'express';
import { IssueService } from '../services/issueService';
import { GovernanceLinkRepository } from '../repositories/governanceLinkRepository';

function getActor(req: Request) {
  if (!req.user) {
    return { id: 'usr_admin_1', name: 'Surya Prashanth' };
  }
  return {
    id: req.user.userId,
    name: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
  };
}

export const IssueController = {
  async listIssues(req: Request, res: Response, next: NextFunction) {
    try {
      const issues = await IssueService.getAllIssues(req.query as any);
      res.json({ success: true, data: { issues } });
    } catch (err) {
      next(err);
    }
  },

  async getIssue(req: Request, res: Response, next: NextFunction) {
    try {
      const issue = await IssueService.getIssueById(req.params.id);
      if (!issue) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Issue not found' } });
      }
      res.json({ success: true, data: { issue } });
    } catch (err) {
      next(err);
    }
  },

  async createIssue(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      const issue = await IssueService.createIssue(req.body, actor);
      res.status(201).json({ success: true, data: { issue } });
    } catch (err) {
      next(err);
    }
  },

  async updateIssue(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      const issue = await IssueService.updateIssue(req.params.id, req.body, actor);
      if (!issue) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Issue not found' } });
      }
      res.json({ success: true, data: { issue } });
    } catch (err) {
      next(err);
    }
  },

  async deleteIssue(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      const deleted = await IssueService.deleteIssue(req.params.id, actor);
      if (!deleted) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Issue not found' } });
      }
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  },

  async getRootCauses(req: Request, res: Response, next: NextFunction) {
    try {
      const summary = await IssueService.getRootCauseSummary(req.query as any);
      res.json({ success: true, data: { summary } });
    } catch (err) {
      next(err);
    }
  },

  async linkItem(req: Request, res: Response, next: NextFunction) {
    try {
      const { targetType, targetId, targetCode, targetName } = req.body;
      const link = await GovernanceLinkRepository.addLink('issue', req.params.id, targetType, targetId, targetCode, targetName);
      res.status(201).json({ success: true, data: { link } });
    } catch (err) {
      next(err);
    }
  },

  async unlinkItem(req: Request, res: Response, next: NextFunction) {
    try {
      const removed = await GovernanceLinkRepository.removeLink(req.params.linkId);
      res.json({ success: true, data: { removed } });
    } catch (err) {
      next(err);
    }
  },
};
