import { Request, Response, NextFunction } from 'express';
import { RiskService } from '../services/riskService';
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

export const RiskController = {
  async listRisks(req: Request, res: Response, next: NextFunction) {
    try {
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      if (page !== undefined || limit !== undefined) {
        const result = await RiskService.getPaginatedRisks(req.query as any);
        return res.json({
          success: true,
          data: {
            risks: result.risks,
            total: result.total,
            page: result.page,
            limit: result.limit,
          },
        });
      }

      const risks = await RiskService.getAllRisks(req.query as any);
      res.json({ success: true, data: { risks, total: risks.length } });
    } catch (err) {
      next(err);
    }
  },

  async getRisk(req: Request, res: Response, next: NextFunction) {
    try {
      const risk = await RiskService.getRiskById(req.params.id);
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
      const actor = getActor(req);
      const risk = await RiskService.createRisk(req.body, actor);
      res.status(201).json({ success: true, data: { risk } });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: err.message },
      });
    }
  },

  async updateRisk(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      const risk = await RiskService.updateRisk(req.params.id, req.body, actor);
      if (!risk) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Risk not found' } });
      }
      res.json({ success: true, data: { risk } });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: err.message },
      });
    }
  },

  async deleteRisk(req: Request, res: Response, next: NextFunction) {
    try {
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
      const heatmap = await RiskService.getHeatmap(req.query as any);
      res.json({ success: true, data: { heatmap } });
    } catch (err) {
      next(err);
    }
  },

  async runProjectAudit(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      const audit = await RiskService.runProjectAuditScan(req.params.projectId, actor);
      res.json({ success: true, data: { audit } });
    } catch (err) {
      next(err);
    }
  },

  async linkItem(req: Request, res: Response, next: NextFunction) {
    try {
      const { targetType, targetId, targetCode, targetName } = req.body;
      const link = await GovernanceLinkRepository.addLink('risk', req.params.id, targetType, targetId, targetCode, targetName);
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
