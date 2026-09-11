import { Request, Response, NextFunction } from 'express';
import { DependencyService } from '../services/dependencyService';

function getActor(req: Request) {
  if (!req.user) {
    return { id: 'usr_admin_1', name: 'Surya Prashanth' };
  }
  return {
    id: req.user.userId,
    name: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
  };
}

export const DependencyController = {
  async listDependencies(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await DependencyService.getAllDependencies(req.query as any);
      res.json({
        success: true,
        data: {
          dependencies: result.dependencies,
          total: result.total,
          page: result.page,
          limit: result.limit,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async getDependency(req: Request, res: Response, next: NextFunction) {
    try {
      const dependency = await DependencyService.getDependencyById(req.params.id);
      if (!dependency) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Dependency not found' } });
      }
      res.json({ success: true, data: { dependency } });
    } catch (err) {
      next(err);
    }
  },

  async createDependency(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      const dependency = await DependencyService.createDependency(req.body, actor);
      res.status(201).json({ success: true, data: { dependency } });
    } catch (err: any) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: err.message || 'Validation error' } });
    }
  },

  async updateDependency(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      const dependency = await DependencyService.updateDependency(req.params.id, req.body, actor);
      res.json({ success: true, data: { dependency } });
    } catch (err: any) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: err.message || 'Validation error' } });
    }
  },

  async deleteDependency(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      const deleted = await DependencyService.deleteDependency(req.params.id, actor);
      if (!deleted) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Dependency not found' } });
      }
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  },

  async getChain(req: Request, res: Response, next: NextFunction) {
    try {
      const chain = await DependencyService.getDependencyChain(req.params.entityId);
      res.json({ success: true, data: { chain } });
    } catch (err) {
      next(err);
    }
  },

  async getGraph(req: Request, res: Response, next: NextFunction) {
    try {
      const graph = await DependencyService.getDependencyGraph(req.query as any);
      res.json({ success: true, data: { graph } });
    } catch (err) {
      next(err);
    }
  },

  async getKPIs(req: Request, res: Response, next: NextFunction) {
    try {
      const kpis = await DependencyService.getKPIs(req.query.projectId as string);
      res.json({ success: true, data: { kpis } });
    } catch (err) {
      next(err);
    }
  },
};
