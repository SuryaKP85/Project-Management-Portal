import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/userService';
import { SafeUser } from '../models/types';

/** The acting user as the services expect it, from the verified JWT payload. */
function actorFrom(req: Request): SafeUser | undefined {
  return req.user
    ? { id: req.user.userId, firstName: req.user.firstName, lastName: req.user.lastName, email: req.user.email, role: req.user.role, isActive: true, createdAt: '', updatedAt: '' }
    : undefined;
}

const notFound = (res: Response) => res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
const unauthenticated = (res: Response) => res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });

export const UserController = {
  /** GET /users?includeInactive=true — inactive accounts are visible to admins only. */
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const wantsInactive = String(req.query.includeInactive ?? '').toLowerCase() === 'true';
      if (wantsInactive && req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only administrators can list inactive users.' } });
      }
      const users = await UserService.getAllUsers({ includeInactive: wantsInactive });
      res.json({ success: true, data: { users } });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await UserService.getUserById(req.params.id);
      if (!user) return notFound(res);
      res.json({ success: true, data: { user } });
    } catch (err) {
      next(err);
    }
  },

  async updateRole(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      if (!actor) return unauthenticated(res);
      const updated = await UserService.updateUserRole(req.params.id, req.body.role, actor);
      if (!updated) return notFound(res);
      res.json({ success: true, data: { user: updated } });
    } catch (err) {
      next(err);
    }
  },

  /** PATCH /users/:id — profile fields only (Sprint 12). */
  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      if (!actor) return unauthenticated(res);
      const updated = await UserService.updateProfile(req.params.id, req.body || {}, actor);
      if (!updated) return notFound(res);
      res.json({ success: true, data: { user: updated } });
    } catch (err) {
      next(err);
    }
  },

  /** PATCH /users/:id/status — admin-only at the route (Sprint 12). */
  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      if (!actor) return unauthenticated(res);
      const updated = await UserService.setActiveStatus(req.params.id, req.body.isActive === true, actor);
      if (!updated) return notFound(res);
      res.json({ success: true, data: { user: updated } });
    } catch (err) {
      next(err);
    }
  },

  /** POST /users/:id/set-password — admin-only at the route (Sprint 12). */
  async setPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      if (!actor) return unauthenticated(res);
      const done = await UserService.setPassword(req.params.id, req.body.password, actor);
      if (!done) return notFound(res);
      res.json({ success: true, data: { message: 'Password set successfully' } });
    } catch (err) {
      next(err);
    }
  },
};
