import { Request, Response, NextFunction } from 'express';
import { RiskService } from '../services/riskService';
import { GovernanceLinkRepository } from '../repositories/governanceLinkRepository';
import { ProjectScope, scopeActor } from '../services/projectScope';
import { resolveEntity } from '../services/dependencyService';
import { notAvailable } from '../services/followThroughSupport';
import { GoalRepository } from '../repositories/goalRepository';
import { GovernanceLinkTargetType } from '../models/types';

const LINK_TARGET_TYPES: GovernanceLinkTargetType[] = ['portfolio', 'product', 'project', 'epic', 'feature', 'story', 'task', 'sprint', 'milestone', 'release', 'goal'];

/**
 * Sprint 23: a client may only request a link (target type + id). The server
 * checks the caller can see the target and takes its code and name from the
 * record itself — a client-supplied display name is never stored.
 */
async function resolvedLinks(req: Request, items: unknown) {
  if (!Array.isArray(items)) throw Object.assign(new Error('linkedItems must be a list.'), { status: 400 });
  const links: { targetType: GovernanceLinkTargetType; targetId: string; targetCode?: string; targetName?: string }[] = [];
  for (const item of items) {
    const targetType = String(item?.targetType ?? '').toLowerCase() as GovernanceLinkTargetType;
    const targetId = String(item?.targetId ?? '').trim();
    if (!LINK_TARGET_TYPES.includes(targetType)) throw Object.assign(new Error(`Unsupported link target type '${targetType}'.`), { status: 400 });
    await ProjectScope.assertLinkTarget(scopeActor(req), targetType, targetId);
    const target = targetType === 'goal'
      ? await GoalRepository.findById(targetId).then((g) => (g ? { code: undefined, name: g.objective } : null))
      : await resolveEntity(targetType, targetId).then((r) => (r.exists ? r : null));
    if (!target) throw notAvailable('Link target');
    links.push({ targetType, targetId, targetCode: target.code, targetName: target.name });
  }
  return links;
}

/** The request body with any requested links replaced by server-resolved ones. */
async function withResolvedLinks(req: Request) {
  const body = { ...(req.body || {}) };
  if (body.linkedItems !== undefined) body.linkedItems = await resolvedLinks(req, body.linkedItems);
  return body;
}

function getActor(req: Request) {
  if (!req.user) {
    return { id: 'usr_admin_1', name: 'Surya Prashanth' };
  }
  return {
    id: req.user.userId,
    name: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
  };
}

/** Sprint 22A: access errors keep their status (404 / 403); anything else stays a 400 as before. */
function fail(res: Response, err: any, code = 'VALIDATION_ERROR') {
  const status = Number(err?.status) >= 400 && Number(err?.status) < 500 ? Number(err.status) : 400;
  return res.status(status).json({ success: false, error: { code: status === 400 ? code : err.code, message: err.message } });
}

/** The risk when the caller can see its project; otherwise null (a 404 that reveals nothing). */
async function visibleRisk(req: Request, id: string) {
  const risk = await RiskService.getRiskById(id);
  return risk && (await ProjectScope.canRead(scopeActor(req), risk.projectId)) ? risk : null;
}

export const RiskController = {
  async listRisks(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = scopeActor(req);
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      // Sprint 22A: only risks of the caller's accessible projects (administrators: every project).
      const { page: _p, limit: _l, ...filter } = req.query as any;
      const risks = await ProjectScope.filter(actor, await RiskService.getAllRisks(filter), (r) => r.projectId);

      if (page !== undefined || limit !== undefined) {
        const result = ProjectScope.page(risks, page, limit);
        return res.json({
          success: true,
          data: {
            risks: result.items,
            total: result.total,
            page: result.page,
            limit: result.limit,
          },
        });
      }

      res.json({ success: true, data: { risks, total: risks.length } });
    } catch (err) {
      next(err);
    }
  },

  async getRisk(req: Request, res: Response, next: NextFunction) {
    try {
      const risk = await visibleRisk(req, req.params.id);
      if (!risk) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Risk not found' } });
      }
      res.json({ success: true, data: { risk } });
    } catch (err) {
      next(err);
    }
  },

  async createRisk(req: Request, res: Response, next: NextFunction) {
    try {
      await ProjectScope.assertWrite(scopeActor(req), req.body?.projectId, 'Project');
      const actor = getActor(req);
      const risk = await RiskService.createRisk(await withResolvedLinks(req), actor);
      res.status(201).json({ success: true, data: { risk } });
    } catch (err: any) {
      fail(res, err);
    }
  },

  async updateRisk(req: Request, res: Response, next: NextFunction) {
    try {
      const existing = await visibleRisk(req, req.params.id);
      if (!existing) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Risk not found' } });
      }
      await ProjectScope.assertMove(scopeActor(req), existing.projectId, req.body?.projectId, 'Risk');
      const actor = getActor(req);
      const risk = await RiskService.updateRisk(req.params.id, await withResolvedLinks(req), actor);
      if (!risk) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Risk not found' } });
      }
      res.json({ success: true, data: { risk } });
    } catch (err: any) {
      fail(res, err);
    }
  },

  async deleteRisk(req: Request, res: Response, next: NextFunction) {
    try {
      const existing = await visibleRisk(req, req.params.id);
      if (!existing) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Risk not found' } });
      }
      await ProjectScope.assertWrite(scopeActor(req), existing.projectId, 'Risk');
      const actor = getActor(req);
      const deleted = await RiskService.deleteRisk(req.params.id, actor);
      if (!deleted) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Risk not found' } });
      }
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  },

  async getHeatmap(req: Request, res: Response, next: NextFunction) {
    try {
      const heatmap = await RiskService.getHeatmap(req.query as any, await ProjectScope.ids(scopeActor(req)));
      res.json({ success: true, data: { heatmap } });
    } catch (err) {
      next(err);
    }
  },

  async runProjectAudit(req: Request, res: Response, next: NextFunction) {
    try {
      // Read-only scan of one project's records: the caller must be able to see that project.
      await ProjectScope.assertRead(scopeActor(req), req.params.projectId, 'Project');
      const actor = getActor(req);
      const audit = await RiskService.runProjectAuditScan(req.params.projectId, actor);
      res.json({ success: true, data: { audit } });
    } catch (err) {
      next(err);
    }
  },

  async linkItem(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = scopeActor(req);
      const risk = await visibleRisk(req, req.params.id);
      if (!risk) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Risk not found' } });
      }
      await ProjectScope.assertWrite(actor, risk.projectId, 'Risk');
      const [target] = await resolvedLinks(req, [req.body]);
      const link = await GovernanceLinkRepository.addLink('risk', risk.id, target.targetType, target.targetId, target.targetCode, target.targetName);
      res.status(201).json({ success: true, data: { link } });
    } catch (err) {
      next(err);
    }
  },

  async unlinkItem(req: Request, res: Response, next: NextFunction) {
    try {
      const risk = await visibleRisk(req, req.params.id);
      if (!risk) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Risk not found' } });
      }
      await ProjectScope.assertWrite(scopeActor(req), risk.projectId, 'Risk');
      const removed = await ProjectScope.removeOwnLink('risk', risk.id, req.params.linkId);
      res.json({ success: true, data: { removed } });
    } catch (err) {
      next(err);
    }
  },
};
