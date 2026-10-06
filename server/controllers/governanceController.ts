import { Request, Response, NextFunction } from 'express';
import { GovernanceService } from '../services/governanceService';
import { TraceabilityRepository } from '../repositories/traceabilityRepository';
import { ProjectScope, scopeActor } from '../services/projectScope';

export const GovernanceController = {
  async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      // Sprint 22A: KPIs, scorecards and activity cover the caller's accessible projects only.
      const summary = await GovernanceService.getDashboardSummary(req.query as any, await ProjectScope.ids(scopeActor(req)));
      res.json({ success: true, data: summary });
    } catch (err) {
      next(err);
    }
  },

  async getTraceability(req: Request, res: Response, next: NextFunction) {
    try {
      const { entityType, id } = req.params;
      // Sprint 22A: a root the caller cannot see is a 404; nodes from other projects are removed.
      const chain = await ProjectScope.scopeTrace(scopeActor(req), await TraceabilityRepository.getTraceabilityChain(entityType as any, id));
      if (!chain) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Entity not found in traceability index' } });
      }
      res.json({ success: true, data: { chain } });
    } catch (err) {
      next(err);
    }
  },
};
