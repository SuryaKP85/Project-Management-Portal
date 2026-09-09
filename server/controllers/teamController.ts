import { Request, Response, NextFunction } from 'express';
import { TeamService } from '../services/teamService';

export const TeamController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const teams = await TeamService.getAllTeams();
      res.json({ success: true, data: { teams } });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const team = await TeamService.getTeamById(req.params.id);
      if (!team) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Team not found' } });
      }
      res.json({ success: true, data: { team } });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user ? { id: req.user.userId, firstName: req.user.firstName, lastName: req.user.lastName, email: req.user.email, role: req.user.role, isActive: true, createdAt: '', updatedAt: '' } : undefined;
      const team = await TeamService.createTeam(req.body, actor);
      res.status(201).json({ success: true, data: { team } });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user ? { id: req.user.userId, firstName: req.user.firstName, lastName: req.user.lastName, email: req.user.email, role: req.user.role, isActive: true, createdAt: '', updatedAt: '' } : undefined;
      const updated = await TeamService.updateTeam(req.params.id, req.body, actor);
      if (!updated) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Team not found' } });
      }
      res.json({ success: true, data: { team: updated } });
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user ? { id: req.user.userId, firstName: req.user.firstName, lastName: req.user.lastName, email: req.user.email, role: req.user.role, isActive: true, createdAt: '', updatedAt: '' } : undefined;
      const deleted = await TeamService.deleteTeam(req.params.id, actor);
      if (!deleted) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Team not found' } });
      }
      res.json({ success: true, data: { message: 'Team deleted successfully' } });
    } catch (err) {
      next(err);
    }
  },

  async addMember(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user ? { id: req.user.userId, firstName: req.user.firstName, lastName: req.user.lastName, email: req.user.email, role: req.user.role, isActive: true, createdAt: '', updatedAt: '' } : undefined;
      const { userId, userName, roleInTeam, allocatedHrs } = req.body;
      if (!userId || !userName) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'userId and userName are required' } });
      }
      const updated = await TeamService.addMember(req.params.id, { userId, userName, roleInTeam: roleInTeam || 'Member', allocatedHrs: allocatedHrs || 40 }, actor);
      if (!updated) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Team not found' } });
      }
      res.json({ success: true, data: { team: updated } });
    } catch (err) {
      next(err);
    }
  },

  async removeMember(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user ? { id: req.user.userId, firstName: req.user.firstName, lastName: req.user.lastName, email: req.user.email, role: req.user.role, isActive: true, createdAt: '', updatedAt: '' } : undefined;
      const updated = await TeamService.removeMember(req.params.id, req.params.userId, actor);
      if (!updated) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Team not found' } });
      }
      res.json({ success: true, data: { team: updated } });
    } catch (err) {
      next(err);
    }
  },
};
