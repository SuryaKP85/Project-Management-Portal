import { respondToDatabaseFailure } from '../middleware/errorHandler';
import { Request, Response, NextFunction } from 'express';
import { DependencyService } from '../services/dependencyService';
import { ProjectScope, ScopeActor, scopeActor } from '../services/projectScope';
import { notAvailable } from '../services/followThroughSupport';

function getActor(req: Request) {
  if (!req.user) return undefined; // Sprint 24: no placeholder user — the service answers 401
  return {
    id: req.user.userId,
    name: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
  };
}

/** Sprint 22A: access errors keep their status (404 / 403); anything else stays a 400 as before. */
function fail(res: Response, err: any) {
  if (respondToDatabaseFailure(res, err)) return res; // Sprint 24: database failures are 409/503, never a validation error
  const status = Number(err?.status) >= 400 && Number(err?.status) < 500 ? Number(err.status) : 400;
  return res.status(status).json({ success: false, error: { code: status === 400 ? 'VALIDATION_ERROR' : err.code, message: err.message || 'Validation error' } });
}

/**
 * Sprint 22A: a dependency with a project is visible only to people who can
 * see that project; one between org-level records (no project) stays visible.
 */
async function visibleDependency(req: Request, id: string) {
  const dependency = await DependencyService.getDependencyById(id);
  return dependency && (await ProjectScope.canReadOptional(scopeActor(req), dependency.projectId)) ? dependency : null;
}

/** Both ends must be records the caller can see; the dependency's project (stated or derived) must be writable. */
async function assertDependencyWrite(actor: ScopeActor, body: any, current: any = {}): Promise<void> {
  const sourceType = body?.sourceEntityType ?? current.sourceEntityType;
  const sourceId = body?.sourceEntityId ?? current.sourceEntityId;
  const targetType = body?.targetEntityType ?? current.targetEntityType;
  const targetId = body?.targetEntityId ?? current.targetEntityId;
  for (const [type, id] of [[sourceType, sourceId], [targetType, targetId]]) {
    const projectId = await ProjectScope.projectOfEntity(type, id);
    if (projectId && projectId !== 'org' && !(await ProjectScope.canRead(actor, projectId))) throw notAvailable('Dependency endpoint');
  }
  const derived = body?.projectId
    || (await ProjectScope.projectOfEntity(sourceType, sourceId))
    || (await ProjectScope.projectOfEntity(targetType, targetId));
  await ProjectScope.assertWriteOptional(actor, derived && derived !== 'org' ? String(derived) : undefined, 'Project');
}

const notFound = (res: Response) => res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Dependency not found' } });

export const DependencyController = {
  async listDependencies(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = scopeActor(req);
      if (actor.role === 'admin') {
        const result = await DependencyService.getAllDependencies(req.query as any);
        return res.json({ success: true, data: { dependencies: result.dependencies, total: result.total, page: result.page, limit: result.limit } });
      }
      // Sprint 22A: scope first, then page, so totals count only what the caller may see.
      const { page, limit, ...filter } = req.query as any;
      const all = await ProjectScope.filterOptional(actor, (await DependencyService.getAllDependencies(filter)).dependencies, (d) => d.projectId);
      const paged = page || limit ? ProjectScope.page(all, page, limit) : null;
      res.json({
        success: true,
        data: {
          dependencies: paged ? paged.items : all,
          total: all.length,
          page: paged ? paged.page : undefined,
          limit: paged ? paged.limit : undefined,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async getDependency(req: Request, res: Response, next: NextFunction) {
    try {
      const dependency = await visibleDependency(req, req.params.id);
      if (!dependency) return notFound(res);
      res.json({ success: true, data: { dependency } });
    } catch (err) {
      next(err);
    }
  },

  async createDependency(req: Request, res: Response, next: NextFunction) {
    try {
      await assertDependencyWrite(scopeActor(req), req.body);
      const actor = getActor(req);
      const dependency = await DependencyService.createDependency(req.body, actor);
      res.status(201).json({ success: true, data: { dependency } });
    } catch (err: any) {
      fail(res, err);
    }
  },

  async updateDependency(req: Request, res: Response, next: NextFunction) {
    try {
      const scope = scopeActor(req);
      const existing = await visibleDependency(req, req.params.id);
      if (!existing) return notFound(res);
      await ProjectScope.assertWriteOptional(scope, existing.projectId, 'Dependency');
      await assertDependencyWrite(scope, req.body, existing);
      const actor = getActor(req);
      const dependency = await DependencyService.updateDependency(req.params.id, req.body, actor);
      res.json({ success: true, data: { dependency } });
    } catch (err: any) {
      fail(res, err);
    }
  },

  async deleteDependency(req: Request, res: Response, next: NextFunction) {
    try {
      const existing = await visibleDependency(req, req.params.id);
      if (!existing) return notFound(res);
      await ProjectScope.assertWriteOptional(scopeActor(req), existing.projectId, 'Dependency');
      const actor = getActor(req);
      const deleted = await DependencyService.deleteDependency(req.params.id, actor);
      if (!deleted) return notFound(res);
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  },

  async getChain(req: Request, res: Response, next: NextFunction) {
    try {
      const chain = await DependencyService.getDependencyChain(req.params.entityId, await ProjectScope.ids(scopeActor(req)));
      res.json({ success: true, data: { chain } });
    } catch (err) {
      next(err);
    }
  },

  async getGraph(req: Request, res: Response, next: NextFunction) {
    try {
      const graph = await DependencyService.getDependencyGraph(req.query as any, await ProjectScope.ids(scopeActor(req)));
      res.json({ success: true, data: { graph } });
    } catch (err) {
      next(err);
    }
  },

  async getKPIs(req: Request, res: Response, next: NextFunction) {
    try {
      const kpis = await DependencyService.getKPIs(req.query.projectId as string, await ProjectScope.ids(scopeActor(req)));
      res.json({ success: true, data: { kpis } });
    } catch (err) {
      next(err);
    }
  },
};
