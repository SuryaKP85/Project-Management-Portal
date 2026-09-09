import { Request, Response, NextFunction } from 'express';
import { GoalService } from '../services/goalService';

export const GoalController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const goals = await GoalService.getAllGoals();
      res.json({ success: true, data: { goals } });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const goal = await GoalService.getGoalById(req.params.id);
      if (!goal) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Goal not found' } });
      }
      res.json({ success: true, data: { goal } });
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

      const goal = await GoalService.createGoal(req.body, actor);
      res.status(201).json({ success: true, data: { goal } });
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

      const updated = await GoalService.updateGoal(req.params.id, req.body, actor);
      if (!updated) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Goal not found' } });
      }
      res.json({ success: true, data: { goal: updated } });
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

      const deleted = await GoalService.deleteGoal(req.params.id, actor);
      if (!deleted) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Goal not found' } });
      }
      res.json({ success: true, data: { message: 'Goal deleted successfully' } });
    } catch (err) {
      next(err);
    }
  },
};
