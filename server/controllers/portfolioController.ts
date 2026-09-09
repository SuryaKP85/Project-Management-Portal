import { Request, Response, NextFunction } from 'express';
import { PortfolioService } from '../services/portfolioService';

export const PortfolioController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const portfolios = await PortfolioService.getAllPortfolios();
      res.json({ success: true, data: { portfolios } });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const portfolio = await PortfolioService.getPortfolioById(req.params.id);
      if (!portfolio) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Portfolio not found' } });
      }
      res.json({ success: true, data: { portfolio } });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user ? { id: req.user.userId, firstName: req.user.firstName, lastName: req.user.lastName, email: req.user.email, role: req.user.role, isActive: true, createdAt: '', updatedAt: '' } : undefined;
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }

      const portfolio = await PortfolioService.createPortfolio(req.body, actor);
      res.status(201).json({ success: true, data: { portfolio } });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user ? { id: req.user.userId, firstName: req.user.firstName, lastName: req.user.lastName, email: req.user.email, role: req.user.role, isActive: true, createdAt: '', updatedAt: '' } : undefined;
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }

      const updated = await PortfolioService.updatePortfolio(req.params.id, req.body, actor);
      if (!updated) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Portfolio not found' } });
      }
      res.json({ success: true, data: { portfolio: updated } });
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user ? { id: req.user.userId, firstName: req.user.firstName, lastName: req.user.lastName, email: req.user.email, role: req.user.role, isActive: true, createdAt: '', updatedAt: '' } : undefined;
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }

      const deleted = await PortfolioService.deletePortfolio(req.params.id, actor);
      if (!deleted) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Portfolio not found' } });
      }
      res.json({ success: true, data: { message: 'Portfolio deleted successfully' } });
    } catch (err) {
      next(err);
    }
  },
};
