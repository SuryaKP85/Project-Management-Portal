import { respondToDatabaseFailure } from '../middleware/errorHandler';
import { Request, Response, NextFunction } from 'express';
import { IssueService } from '../services/issueService';
import { GovernanceLinkRepository } from '../repositories/governanceLinkRepository';
import { ProjectScope, scopeActor } from '../services/projectScope';

function getActor(req: Request) {
  if (!req.user) return undefined; // Sprint 24: no placeholder user — the service answers 401
  return {
    id: req.user.userId,
    name: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
  };
}

/** Sprint 22A: access errors keep their status (404 / 403); anything else stays a 400 as before. */
function fail(res: Response, err: any, code = 'VALIDATION_ERROR') {
  if (respondToDatabaseFailure(res, err)) return res; // Sprint 24: database failures are 409/503, never a validation error
  const status = Number(err?.status) >= 400 && Number(err?.status) < 500 ? Number(err.status) : 400;
  return res.status(status).json({ success: false, error: { code: status === 400 ? code : err.code, message: err.message } });
}

/** The issue when the caller can see its project; otherwise null (a 404 that reveals nothing). */
async function visibleIssue(req: Request, id: string) {
  const issue = await IssueService.getIssueById(id);
  return issue && (await ProjectScope.canRead(scopeActor(req), issue.projectId)) ? issue : null;
}

const notFound = (res: Response) => res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Issue not found' } });

export const IssueController = {
  async listIssues(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = scopeActor(req);
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      // Sprint 22A: only issues of the caller's accessible projects (administrators: every project).
      const { page: _p, limit: _l, ...filter } = req.query as any;
      const issues = await ProjectScope.filter(actor, await IssueService.getAllIssues(filter), (i) => i.projectId);

      if (page !== undefined || limit !== undefined) {
        const result = ProjectScope.page(issues, page, limit);
        return res.json({
          success: true,
          data: {
            issues: result.items,
            total: result.total,
            page: result.page,
            limit: result.limit,
          },
        });
      }

      res.json({ success: true, data: { issues, total: issues.length } });
    } catch (err) {
      next(err);
    }
  },

  async getIssue(req: Request, res: Response, next: NextFunction) {
    try {
      const issue = await visibleIssue(req, req.params.id);
      if (!issue) return notFound(res);
      res.json({ success: true, data: { issue } });
    } catch (err) {
      next(err);
    }
  },

  async createIssue(req: Request, res: Response, next: NextFunction) {
    try {
      await ProjectScope.assertWrite(scopeActor(req), req.body?.projectId, 'Project');
      const actor = getActor(req);
      const issue = await IssueService.createIssue(req.body, actor);
      res.status(201).json({ success: true, data: { issue } });
    } catch (err: any) {
      fail(res, err);
    }
  },

  async updateIssue(req: Request, res: Response, next: NextFunction) {
    try {
      const existing = await visibleIssue(req, req.params.id);
      if (!existing) return notFound(res);
      await ProjectScope.assertMove(scopeActor(req), existing.projectId, req.body?.projectId, 'Issue');
      const actor = getActor(req);
      const issue = await IssueService.updateIssue(req.params.id, req.body, actor);
      if (!issue) return notFound(res);
      res.json({ success: true, data: { issue } });
    } catch (err: any) {
      fail(res, err);
    }
  },

  async deleteIssue(req: Request, res: Response, next: NextFunction) {
    try {
      const existing = await visibleIssue(req, req.params.id);
      if (!existing) return notFound(res);
      await ProjectScope.assertWrite(scopeActor(req), existing.projectId, 'Issue');
      const actor = getActor(req);
      const deleted = await IssueService.deleteIssue(req.params.id, actor);
      if (!deleted) return notFound(res);
      res.json({ success: true, data: { deleted: true } });
    } catch (err: any) {
      fail(res, err, 'DELETE_ERROR');
    }
  },

  async getRootCauses(req: Request, res: Response, next: NextFunction) {
    try {
      const summary = await IssueService.getRootCauseSummary(req.query as any, await ProjectScope.ids(scopeActor(req)));
      res.json({ success: true, data: { summary } });
    } catch (err) {
      next(err);
    }
  },

  async linkItem(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = scopeActor(req);
      const issue = await visibleIssue(req, req.params.id);
      if (!issue) return notFound(res);
      await ProjectScope.assertWrite(actor, issue.projectId, 'Issue');
      const { targetType, targetId, targetCode, targetName } = req.body;
      await ProjectScope.assertLinkTarget(actor, targetType, targetId);
      const link = await GovernanceLinkRepository.addLink('issue', issue.id, targetType, targetId, targetCode, targetName);
      res.status(201).json({ success: true, data: { link } });
    } catch (err) {
      next(err);
    }
  },

  async unlinkItem(req: Request, res: Response, next: NextFunction) {
    try {
      const issue = await visibleIssue(req, req.params.id);
      if (!issue) return notFound(res);
      await ProjectScope.assertWrite(scopeActor(req), issue.projectId, 'Issue');
      const removed = await ProjectScope.removeOwnLink('issue', issue.id, req.params.linkId);
      res.json({ success: true, data: { removed } });
    } catch (err) {
      next(err);
    }
  },
};
