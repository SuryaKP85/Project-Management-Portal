import { Request, Response, NextFunction } from 'express';
import { GovernanceService } from '../services/governanceService';
import { TraceabilityRepository } from '../repositories/traceabilityRepository';

export const GovernanceController = {
  async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const summary = await GovernanceService.getDashboardSummary(req.query as any);
      res.json({ success: true, data: summary });
    } catch (err) {
      next(err);
    }
  },

  async getTraceability(req: Request, res: Response, next: NextFunction) {
    try {
      const { entityType, id } = req.params;
      const chain = await TraceabilityRepository.getTraceabilityChain(entityType as any, id);
      if (!chain) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Entity not found in traceability index' } });
      }
      res.json({ success: true, data: { chain } });
    } catch (err) {
      next(err);
    }
  },
};
